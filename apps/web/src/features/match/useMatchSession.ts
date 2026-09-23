import type {
    Card,
    ChatMessagePayload,
    ErrorPayload,
    MatchFinishedPayload,
    RedactedMatchState,
    RoundResult,
} from '@kardux/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { getToken } from '../../lib/session';
import type { GameSocket } from '../../lib/socket';
import { whenConnected } from '../../lib/socket';

/**
 * Round choreography, in ms after the server resolves a round. Deliberately unhurried: every
 * player has to be able to *read* the comparison before the cards leave the table.
 *   0         flip every card face-up (staggered)
 *   REVEAL    the winner's card lights up, the rest dim, the banner lands
 *   COLLECT   the cards fly to the winner's seat (or into the pot on a tie)
 *   HOLD      the table clears and the next round begins
 */
export const REVEAL_RESULT_MS = 1_300;
export const REVEAL_COLLECT_MS = 3_700;
export const REVEAL_HOLD_MS = 4_900;
/** Shuffle + deal animation length at match start. */
export const DEAL_MS = 4_200;

export type RevealStage = 'flip' | 'result' | 'collect';

export interface RevealState {
    attribute: string;
    cards: Record<string, Card>;
    result: RoundResult | null;
    stage: RevealStage;
}

export type SessionStatus = 'connecting' | 'ready' | 'lost';

export interface MatchSession {
    status: SessionStatus;
    fatalError: string | null;
    state: RedactedMatchState | null;
    reveal: RevealState | null;
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

/**
 * Owns the live connection to one match: (re)joins on mount and on every socket reconnect
 * (a page reload or a dropped connection lands you back in your exact seat), and turns the
 * server's event stream into render-ready state - including the paced reveal of each round and
 * the deal animation, which the server resolves instantly but players need to *see*.
 */
export function useMatchSession(matchId: string, onError: (message: string) => void): MatchSession {
    const [status, setStatus] = useState<SessionStatus>('connecting');
    const [fatalError, setFatalError] = useState<string | null>(null);
    const [state, setState] = useState<RedactedMatchState | null>(null);
    const [reveal, setReveal] = useState<RevealState | null>(null);
    const [dealing, setDealing] = useState(false);
    const [myPlayedCard, setMyPlayedCard] = useState<Card | null>(null);
    const [finished, setFinished] = useState<MatchFinishedPayload | null>(null);
    const [chat, setChat] = useState<ChatMessagePayload[]>([]);

    const socketRef = useRef<GameSocket | null>(null);
    const stateRef = useRef<RedactedMatchState | null>(null);
    const revealTimers = useRef<number[]>([]);
    const dealTimer = useRef<number | undefined>(undefined);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let disposed = false;
        let socket: GameSocket | null = null;

        const clearRevealTimers = (): void => {
            for (const timer of revealTimers.current) window.clearTimeout(timer);
            revealTimers.current = [];
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
                    setFatalError('Ya estás jugando en otra sala.');
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
                if (next.phase === 'FINISHED') {
                    setFinished(
                        (current) =>
                            current ?? {
                                standings: [...next.players].sort(
                                    (a, b) => b.cardCount - a.cardCount,
                                ),
                                winnerId: next.winnerId,
                                isDraw: next.isDraw,
                            },
                    );
                }
            },
            'match:started': () => {
                setDealing(true);
                window.clearTimeout(dealTimer.current);
                dealTimer.current = window.setTimeout(() => setDealing(false), DEAL_MS);
            },
            'round:cardPlayed': (payload: { playerId: string }) => {
                // The server lays our top card down for us; `stateRef` still holds the snapshot
                // from before that play, so its top card is exactly the one that just left.
                const current = stateRef.current;
                if (current && payload.playerId === current.yourId && current.yourTopCard) {
                    setMyPlayedCard(current.yourTopCard);
                }
            },
            'round:revealed': (payload: { cards: Record<string, Card> }) => {
                clearRevealTimers();
                setReveal({
                    attribute: stateRef.current?.round?.attribute ?? '',
                    cards: payload.cards,
                    result: null,
                    stage: 'flip',
                });
            },
            'round:resolved': (result: RoundResult) => {
                setReveal({
                    attribute: result.attribute,
                    cards: result.cards,
                    result,
                    stage: 'flip',
                });
                clearRevealTimers();
                revealTimers.current = [
                    window.setTimeout(
                        () => setReveal((current) => current && { ...current, stage: 'result' }),
                        REVEAL_RESULT_MS,
                    ),
                    window.setTimeout(
                        () => setReveal((current) => current && { ...current, stage: 'collect' }),
                        REVEAL_COLLECT_MS,
                    ),
                    window.setTimeout(() => {
                        setReveal(null);
                        setMyPlayedCard(null);
                    }, REVEAL_HOLD_MS),
                ];
            },
            'match:finished': (payload: MatchFinishedPayload) => {
                // Let the last round's reveal play out before the curtain.
                window.setTimeout(() => setFinished(payload), REVEAL_HOLD_MS);
            },
            'match:closed': () => {
                setFatalError('El anfitrión cerró la partida.');
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
            clearRevealTimers();
            window.clearTimeout(dealTimer.current);
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
            onErrorRef.current('Sin conexión con el servidor. Reconectando…');
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
    const leave = useCallback(() => emit((socket) => socket.emit('match:leave')), [emit]);
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
