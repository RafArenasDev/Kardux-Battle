import type {
    Card,
    ChatMessagePayload,
    ErrorPayload,
    MatchFinishedPayload,
    RedactedMatchState,
    RoundResult,
} from '@kardux/contracts';
import { TABLE_TIMING } from '@kardux/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../../i18n';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { getToken } from '../../lib/session';
import type { GameSocket } from '../../lib/socket';
import { getGameSocket, whenConnected } from '../../lib/socket';

/**
 * Round choreography, in ms after the server resolves a round. Strictly one step after the
 * other, and all of it inside `TABLE_TIMING.revealMs` - the window the server waits before it
 * opens the next turn, so a new round can never start while this one is still on screen:
 *   0         the last card lands on the table (still face down)
 *   FLIP      every face-down card flips face up, one after another
 *   RESULT    the result banner covers the table
 *   COLLECT   the banner clears and the cards fly to the winner (or into the pot on a tie)
 *   CLEAR     the table is empty again
 */
const FLIP_AT = 800;
const RESULT_AT = 2_300;
const COLLECT_AT = 4_300;
const CLEAR_AT = TABLE_TIMING.revealMs - 300;

export type RevealStage = 'landing' | 'flip' | 'result' | 'collect';

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

        const later = (ms: number, run: () => void): void => {
            timers.current.push(window.setTimeout(run, ms));
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
            } catch (error) {
                if (!disposed) setFatalError(errorMessage(error));
            }
        };

        const handlers = {
            connect: () => {
                if (socket) void rejoin(socket);
            },
            disconnect: () => setStatus('lost'),
            'match:state': (next: RedactedMatchState) => {
                if (next.matchId !== matchId) return;
                const previous = stateRef.current;
                // Ignore stale snapshots that arrive out of order.
                if (previous && next.version < previous.version) return;
                stateRef.current = next;
                setState(next);
                setStatus('ready');
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
                revealEndsAt.current = Date.now() + TABLE_TIMING.revealMs;
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
                later(FLIP_AT, () =>
                    setReveal((current) => current && { ...current, stage: 'flip' }),
                );
                later(RESULT_AT, () =>
                    setReveal((current) => current && { ...current, stage: 'result' }),
                );
                later(COLLECT_AT, () =>
                    setReveal((current) => current && { ...current, stage: 'collect' }),
                );
                later(COLLECT_AT + 1_000, () => setFrozen(null));
                later(CLEAR_AT, () => {
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
