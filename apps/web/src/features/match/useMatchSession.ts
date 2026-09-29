import type {
    Card,
    ChatMessagePayload,
    ErrorPayload,
    MatchFinishedPayload,
    PongLatencyPayload,
    RedactedMatchState,
    RoundResult,
} from '@kardux/contracts';
import { TABLE_TIMING, revealSchedule } from '@kardux/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../../i18n';
import { recordServerTime } from '../../lib/clock';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { getToken } from '../../lib/session';
import type { GameSocket } from '../../lib/socket';
import { getGameSocket, whenConnected } from '../../lib/socket';

/** Delays (ms) of the calibration pings sent right after joining: a quick burst so the offset
 *  is usable within ~2 s of landing on the table, not just after the first 30 s tick. */
const LATENCY_PING_BURST_MS = [0, 700, 1_600];
const LATENCY_PING_INTERVAL_MS = 30_000;

/**
 * Round choreography, one clear beat after another (`revealSchedule` in `@kardux/contracts`,
 * the same schedule the server waits for before it opens the next turn):
 *   landing   the last card lands on the table, face down like every other card
 *   flip      the cards flip face up, one player after another
 *   compare   the winning card glows on the chosen attribute, the rest dim
 *   result    the result banner covers the table: who takes the cards, and how many
 *   collect   the cards fly to the winner (or into the pot on a tie)
 */
export type RevealStage = 'landing' | 'flip' | 'compare' | 'result' | 'collect';

export interface RevealState {
    attribute: string;
    cards: Record<string, Card>;
    result: RoundResult;
    stage: RevealStage;
}

/** Pile and pot sizes as they were before a round resolved, shown until the collected cards
 *  have actually flown to their new owner. */
export interface FrozenCounts {
    cards: Record<string, number>;
    pot: number;
}

export type SessionStatus = 'connecting' | 'ready' | 'lost';

export interface MatchSession {
    status: SessionStatus;
    fatalError: string | null;
    state: RedactedMatchState | null;
    reveal: RevealState | null;
    frozen: FrozenCounts | null;
    /** True while the deal animation runs (right after `match:started`). */
    dealing: boolean;
    myPlayedCard: Card | null;
    finished: MatchFinishedPayload | null;
    chat: ChatMessagePayload[];
    selectAttribute: (attribute: string) => void;
    start: () => void;
    cancelCountdown: () => void;
    leave: () => void;
    sendChat: (text: string) => void;
    quickRematch: () => Promise<string | null>;
}

/** Tells the server this tab walked away from a match. Leaving is always final. */
export function leaveMatch(): void {
    const socket = getGameSocket();
    if (socket.connected) socket.emit('match:leave');
}

/**
 * Owns the live connection to one match: (re)joins on mount and on every socket reconnect (a
 * reload within the grace period lands you back in your seat), and turns the server's event
 * stream into render-ready state - including the paced reveal of each round and the deal
 * animation, which the server resolves instantly but players need to *see*.
 */
export function useMatchSession(matchId: string, onError: (message: string) => void): MatchSession {
    const [status, setStatus] = useState<SessionStatus>('connecting');
    const [fatalError, setFatalError] = useState<string | null>(null);
    const [state, setState] = useState<RedactedMatchState | null>(null);
    const [reveal, setReveal] = useState<RevealState | null>(null);
    const [frozen, setFrozen] = useState<FrozenCounts | null>(null);
    const [dealing, setDealing] = useState(false);
    const [myPlayedCard, setMyPlayedCard] = useState<Card | null>(null);
    const [finished, setFinished] = useState<MatchFinishedPayload | null>(null);
    const [chat, setChat] = useState<ChatMessagePayload[]>([]);

    const socketRef = useRef<GameSocket | null>(null);
    const stateRef = useRef<RedactedMatchState | null>(null);
    const revealEndsAt = useRef(0);
    const timers = useRef<number[]>([]);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let disposed = false;
        let socket: GameSocket | null = null;
        let latencyIntervalId: number | null = null;

        const later = (ms: number, run: () => void): void => {
            timers.current.push(window.setTimeout(run, ms));
        };

        /** One clock-calibration round trip: the offset (`recordServerTime`) is what lets
         *  `turnOpen` in `useHand` open for the round leader even when the device clock is
         *  skewed from the server's - see docs/PENDING-WORK.md, "the leader could not choose
         *  the attribute". */
        const pingLatency = (target: GameSocket): void => {
            target.emit('ping:latency', { t: Date.now() });
        };

        const startLatencyPings = (target: GameSocket): void => {
            for (const delay of LATENCY_PING_BURST_MS) later(delay, () => pingLatency(target));
            latencyIntervalId = window.setInterval(
                () => pingLatency(target),
                LATENCY_PING_INTERVAL_MS,
            );
        };

        const rejoin = async (target: GameSocket): Promise<void> => {
            try {
                const ack = await target
                    .timeout(10_000)
                    .emitWithAck('match:rejoin', { token: getToken() ?? '' });
                if (disposed) return;
                if (isErrorPayload(ack)) {
                    setFatalError(errorMessage(ack));
                    return;
                }
                if (ack.matchId !== matchId) {
                    setFatalError(i18n.t('table.otherRoom'));
                    return;
                }
                setStatus('ready');
                startLatencyPings(target);
            } catch (error) {
                if (!disposed) setFatalError(errorMessage(error));
            }
        };

        const handlers = {
            connect: () => {
                if (socket) void rejoin(socket);
            },
            disconnect: () => {
                setStatus('lost');
                if (latencyIntervalId !== null) {
                    window.clearInterval(latencyIntervalId);
                    latencyIntervalId = null;
                }
            },
            'pong:latency': (payload: PongLatencyPayload) => {
                recordServerTime(payload.t, payload.serverTime);
            },
            'match:state': (next: RedactedMatchState) => {
                if (next.matchId !== matchId) return;
                const previous = stateRef.current;
                // Ignore stale snapshots that arrive out of order.
                if (previous && next.version < previous.version) return;
                stateRef.current = next;
                setState(next);
                setStatus('ready');
                // Safety net: the server always flips phase to AWAITING_ATTRIBUTE the instant a
                // round resolves (`resolveRound` in @kardux/engine sets it in the same reduce()
                // call, well before `turnOpensAt`) - so `match:state` for the *same* round we
                // just started animating arrives right behind `round:resolved`, every round, not
                // just on a stale/backgrounded tab. Only force-clear the reveal once real time
                // has actually passed `revealEndsAt` (the staged choreography's own doneAt) - a
                // foreground tab reaches that naturally through its own `later(...)` timers
                // below, so this only fires for the throttled-tab case it was written for.
                // Clearing unconditionally here raced the choreography's very first frame and
                // wiped it before a single stage ever rendered - no flip, no banner, nothing.
                if (next.phase === 'AWAITING_ATTRIBUTE' && Date.now() >= revealEndsAt.current) {
                    setReveal(null);
                    setFrozen(null);
                    setMyPlayedCard(null);
                }
            },
            'match:started': () => {
                setDealing(true);
                later(TABLE_TIMING.dealMs, () => setDealing(false));
            },
            'round:cardPlayed': (payload: { playerId: string }) => {
                // The server lays our top card down for us; `stateRef` still holds the snapshot
                // from before that play, so its top card is exactly the one that just left.
                const current = stateRef.current;
                if (current && payload.playerId === current.yourId && current.yourTopCard) {
                    setMyPlayedCard(current.yourTopCard);
                }
            },
            'round:resolved': (result: RoundResult) => {
                const schedule = revealSchedule(Object.keys(result.cards).length);
                revealEndsAt.current = Date.now() + schedule.doneAt;
                const before = stateRef.current;
                if (before) {
                    setFrozen({
                        cards: Object.fromEntries(
                            before.players.map((player) => [
                                player.id,
                                player.cardCount - (result.cards[player.id] ? 1 : 0),
                            ]),
                        ),
                        pot: before.potSize,
                    });
                }
                setReveal({
                    attribute: result.attribute,
                    cards: result.cards,
                    result,
                    stage: 'landing',
                });
                const stage = (next: RevealStage) => () =>
                    setReveal((current) => current && { ...current, stage: next });
                later(schedule.flipAt, stage('flip'));
                later(schedule.compareAt, stage('compare'));
                later(schedule.resultAt, stage('result'));
                later(schedule.collectAt, stage('collect'));
                later(schedule.collectAt + 900, () => setFrozen(null));
                later(schedule.doneAt - 200, () => {
                    setReveal(null);
                    setMyPlayedCard(null);
                });
            },
            'match:finished': (payload: MatchFinishedPayload) => {
                // Let the last round's reveal play out before the curtain.
                const wait = Math.max(600, revealEndsAt.current - Date.now());
                later(wait, () => setFinished(payload));
            },
            'match:closed': () => {
                setFatalError(i18n.t('table.closed'));
            },
            'chat:message': (message: ChatMessagePayload) => {
                setChat((current) => [...current, message].slice(-60));
            },
            error: (payload: ErrorPayload) => {
                onErrorRef.current(errorMessage(payload));
            },
        };

        void (async () => {
            try {
                socket = await whenConnected();
            } catch (error) {
                if (!disposed) setFatalError(errorMessage(error));
                return;
            }
            if (disposed) return;
            socketRef.current = socket;
            for (const [event, handler] of Object.entries(handlers)) {
                socket.on(event as never, handler as never);
            }
            await rejoin(socket);
        })();

        return () => {
            disposed = true;
            for (const timer of timers.current) window.clearTimeout(timer);
            timers.current = [];
            if (latencyIntervalId !== null) window.clearInterval(latencyIntervalId);
            if (socket) {
                for (const [event, handler] of Object.entries(handlers)) {
                    socket.off(event as never, handler as never);
                }
            }
        };
    }, [matchId]);

    const emit = useCallback((run: (socket: GameSocket) => void) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
            onErrorRef.current(i18n.t('errors.reconnecting'));
            return;
        }
        run(socket);
    }, []);

    const selectAttribute = useCallback(
        (attribute: string) =>
            emit((socket) => socket.emit('round:selectAttribute', { attribute })),
        [emit],
    );
    const start = useCallback(() => emit((socket) => socket.emit('match:start')), [emit]);
    const cancelCountdown = useCallback(
        () => emit((socket) => socket.emit('match:cancelCountdown')),
        [emit],
    );
    const leave = useCallback(() => leaveMatch(), []);
    const sendChat = useCallback(
        (text: string) => emit((socket) => socket.emit('chat:send', { text })),
        [emit],
    );

    /** While alone in a quick lobby: ask the server again, in case someone else started
     *  searching at the same time and got their own lobby. Returns the match to move to. */
    const quickRematch = useCallback(async (): Promise<string | null> => {
        const socket = socketRef.current;
        if (!socket?.connected) return null;
        try {
            const ack = await socket.timeout(8_000).emitWithAck('match:quick', {});
            return isErrorPayload(ack) ? null : ack.matchId;
        } catch {
            return null;
        }
    }, []);

    return {
        status,
        fatalError,
        state,
        reveal,
        frozen,
        dealing,
        myPlayedCard,
        finished,
        chat,
        selectAttribute,
        start,
        cancelCountdown,
        leave,
        sendChat,
        quickRematch,
    };
}
