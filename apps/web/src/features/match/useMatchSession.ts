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

/** How long a resolved round stays on the table before the next one takes over. */
export const REVEAL_HOLD_MS = 3_400;
/** Shuffle + deal animation length at match start. */
export const DEAL_MS = 2_800;

export interface RevealState {
    attribute: string;
    cards: Record<string, Card>;
    result: RoundResult | null;
    tiePot: number | null;
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
    latency: number | null;
    selectAttribute: (attribute: string) => void;
    playCard: () => void;
    start: () => void;
    cancelCountdown: () => void;
    leave: () => void;
    sendChat: (text: string) => void;
}

/**
 * Owns the live connection to one match: (re)joins on mount and on every socket reconnect
 * (a page reload or a dropped connection lands you back in your exact seat), and turns the
 * server's event stream into render-ready state - including the timed reveal of each round
 * and the deal animation, which the server resolves instantly but players need to *see*.
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
    const [latency, setLatency] = useState<number | null>(null);

    const socketRef = useRef<GameSocket | null>(null);
    const stateRef = useRef<RedactedMatchState | null>(null);
    const revealTimer = useRef<number | undefined>(undefined);
    const dealTimer = useRef<number | undefined>(undefined);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let disposed = false;
        let socket: GameSocket | null = null;

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
            'round:revealed': (payload: { cards: Record<string, Card> }) => {
                window.clearTimeout(revealTimer.current);
                setReveal({
                    attribute: stateRef.current?.round?.attribute ?? '',
                    cards: payload.cards,
                    result: null,
                    tiePot: null,
                });
            },
            'round:resolved': (result: RoundResult) => {
                setReveal((current) => ({
                    attribute: result.attribute,
                    cards: result.cards,
                    result,
                    tiePot: current?.tiePot ?? null,
                }));
                window.clearTimeout(revealTimer.current);
                revealTimer.current = window.setTimeout(() => {
                    setReveal(null);
                    setMyPlayedCard(null);
                }, REVEAL_HOLD_MS);
            },
            'round:tie': (payload: { potSize: number }) => {
                setReveal((current) =>
                    current ? { ...current, tiePot: payload.potSize } : current,
                );
            },
            'match:finished': (payload: MatchFinishedPayload) => {
                // Let the last round's reveal play before the curtain.
                window.setTimeout(() => setFinished(payload), REVEAL_HOLD_MS);
            },
            'chat:message': (message: ChatMessagePayload) => {
                setChat((current) => [...current, message].slice(-60));
            },
            'pong:latency': (payload: { t: number }) => {
                setLatency(Math.round(performance.now() - payload.t));
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

        const ping = window.setInterval(() => {
            socketRef.current?.emit('ping:latency', { t: performance.now() });
        }, 5_000);

        return () => {
            disposed = true;
            window.clearInterval(ping);
            window.clearTimeout(revealTimer.current);
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
        (attribute: string) => {
            setMyPlayedCard(stateRef.current?.yourTopCard ?? null);
            emit((socket) => socket.emit('round:selectAttribute', { attribute }));
        },
        [emit],
    );

    const playCard = useCallback(() => {
        setMyPlayedCard(stateRef.current?.yourTopCard ?? null);
        emit((socket) => socket.emit('round:playCard'));
    }, [emit]);

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

    return {
        status,
        fatalError,
        state,
        reveal,
        dealing,
        myPlayedCard,
        finished,
        chat,
        latency,
        selectAttribute,
        playCard,
        start,
        cancelCountdown,
        leave,
        sendChat,
    };
}
