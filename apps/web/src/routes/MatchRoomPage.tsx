import type {
    MatchFinishedPayload,
    MatchJoinRequestedPayload,
    Player,
    PublicRoundView,
    RedactedMatchState,
    RoundResult,
} from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import { type JSX, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import MatchClock from '../components/MatchClock';
import RadialTable from '../components/RadialTable';
import VictoryOverlay from '../components/VictoryOverlay';
import { getMatchByCode } from '../lib/api';
import { getUser } from '../lib/session';
import { connectGameSocket, disconnectGameSocket, getGameSocket } from '../lib/socket';

interface LocationState {
    code?: string;
    hostId?: string;
}

export default function MatchRoomPage(): JSX.Element {
    const { matchId } = useParams<{ matchId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const state = (location.state as LocationState | null) ?? {};

    const [players, setPlayers] = useState<Player[]>([]);
    const [pendingRequests, setPendingRequests] = useState<MatchJoinRequestedPayload[]>([]);
    const [matchState, setMatchState] = useState<RedactedMatchState>();
    const [hostId, setHostId] = useState<string | undefined>(state.hostId);
    const [error, setError] = useState<string>();
    const [joined, setJoined] = useState(false);
    const joinAttempted = useRef(false);

    // Round-local UI state, rebuilt each round from the `/game` socket contract - the engine
    // itself doesn't exist in this worktree yet, but the wiring below is real, not mocked, so
    // it lights up the moment `MatchRuntimeService` starts emitting these events for real.
    const [roundView, setRoundView] = useState<PublicRoundView | null>(null);
    const [lastResult, setLastResult] = useState<RoundResult | null>(null);
    const [roundLog, setRoundLog] = useState<RoundResult[]>([]);
    const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
    const [countdownNow, setCountdownNow] = useState(Date.now());
    const [finished, setFinished] = useState<MatchFinishedPayload | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);

    const user = getUser();
    const socket = getGameSocket();

    useEffect(() => {
        if (!matchId || !user) return;

        // Resolve the join code either from navigation state (came from /create or
        // /join/:code) or, on a hard refresh where state is lost, by re-fetching the match -
        // `GET /matches/:code` needs the code, not the id, so this only works if we still
        // have one from somewhere; otherwise this page can't recover on a raw refresh yet.
        const code = state.code;
        const currentUser = user;

        async function ensureJoinedAndListening(): Promise<void> {
            if (!code) {
                setError('No se pudo recuperar el código de la sala (recarga desde el lobby).');
                return;
            }
            if (!hostId) {
                try {
                    const summary = await getMatchByCode(code);
                    setHostId(summary.hostId);
                } catch {
                    // Non-fatal - the room list/host-actions just stay generic without it.
                }
            }

            const gameSocket = connectGameSocket();

            gameSocket.on('match:playerJoined', (player) => {
                setPlayers((current) =>
                    current.some((p) => p.id === player.id) ? current : [...current, player],
                );
            });
            gameSocket.on('match:playerLeft', ({ playerId }) => {
                setPlayers((current) => current.filter((p) => p.id !== playerId));
            });
            gameSocket.on('match:joinRequested', (request) => {
                setPendingRequests((current) => [...current, request]);
            });
            gameSocket.on('match:state', setMatchState);
            gameSocket.on('match:countdown', ({ endsAt }) => setCountdownEndsAt(endsAt));
            gameSocket.on('match:started', () => setCountdownEndsAt(null));

            gameSocket.on('round:started', (view) => {
                setRoundView(view);
                setLastResult(null);
            });
            gameSocket.on('round:attributeSelected', ({ attribute }) => {
                setRoundView((current) => (current ? { ...current, attribute } : current));
            });
            gameSocket.on('round:cardPlayed', ({ playerId }) => {
                setRoundView((current) =>
                    current
                        ? {
                              ...current,
                              playedBy: current.playedBy.includes(playerId)
                                  ? current.playedBy
                                  : [...current.playedBy, playerId],
                          }
                        : current,
                );
            });
            gameSocket.on('round:revealed', ({ cards }) => {
                setRoundView((current) =>
                    current ? { ...current, revealedCards: cards } : current,
                );
            });
            gameSocket.on('round:resolved', (result) => {
                setLastResult(result);
                setRoundLog((current) => [result, ...current].slice(0, 20));
            });
            gameSocket.on('match:finished', setFinished);
            gameSocket.on('error', (payload) => setError(payload.message));

            gameSocket.on('pong:latency', ({ t }) => setLatencyMs(Date.now() - t));

            if (!joinAttempted.current) {
                joinAttempted.current = true;
                gameSocket.emit(
                    'match:join',
                    { code, nickname: currentUser.nickname, avatarSeed: currentUser.avatarSeed },
                    (response) => {
                        if ('message' in response) {
                            setError(response.message);
                            return;
                        }
                        setJoined(true);
                    },
                );
            }
        }

        void ensureJoinedAndListening();

        return () => {
            socket.off('match:playerJoined');
            socket.off('match:playerLeft');
            socket.off('match:joinRequested');
            socket.off('match:state');
            socket.off('match:countdown');
            socket.off('match:started');
            socket.off('round:started');
            socket.off('round:attributeSelected');
            socket.off('round:cardPlayed');
            socket.off('round:revealed');
            socket.off('round:resolved');
            socket.off('match:finished');
            socket.off('error');
            socket.off('pong:latency');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId]);

    // HUD latency ping, every 5s while connected - CLAUDE.md's "latencia" HUD field.
    useEffect(() => {
        if (!joined) return;
        const ping = (): void => {
            socket.emit('ping:latency', { t: Date.now() });
        };
        ping();
        const id = setInterval(ping, 5000);
        return () => clearInterval(id);
    }, [joined, socket]);

    // Countdown ticker for the pre-start "match:countdown" overlay.
    useEffect(() => {
        if (!countdownEndsAt) return;
        const id = setInterval(() => setCountdownNow(Date.now()), 200);
        return () => clearInterval(id);
    }, [countdownEndsAt]);

    function respondJoin(requestId: string, accept: boolean): void {
        socket.emit('match:respondJoin', { requestId, accept });
        setPendingRequests((current) => current.filter((r) => r.requestId !== requestId));
    }

    function handleLeave(): void {
        socket.emit('match:leave');
        disconnectGameSocket();
        navigate('/lobby');
    }

    function handleSelectAttribute(attribute: string): void {
        socket.emit('round:selectAttribute', { attribute });
    }

    function handlePlayCard(): void {
        socket.emit('round:playCard');
    }

    const amHost = Boolean(user && hostId && user.id === hostId);
    const roster = matchState?.players ?? players;
    const secondsLeft = countdownEndsAt
        ? Math.max(0, Math.ceil((countdownEndsAt - countdownNow) / 1000))
        : null;

    return (
        <div className="page match-room">
            <AnimatePresence>
                {finished && user && (
                    <VictoryOverlay
                        result={finished}
                        selfId={user.id}
                        onClose={() => navigate('/lobby')}
                    />
                )}
            </AnimatePresence>

            <div className="match-hud">
                <div className="row" style={{ gap: '1.1rem' }}>
                    <span className="code-badge">{state.code ?? matchState?.code ?? matchId}</span>
                    {matchState && (
                        <MatchClock
                            endsAt={matchState.endsAt}
                            matchDurationMs={matchState.config.matchDurationMs}
                            started={Boolean(matchState.startedAt)}
                        />
                    )}
                    {roundView && <span className="pill">Ronda {roundView.index + 1}</span>}
                    {latencyMs !== null && <span className="pill">{latencyMs} ms</span>}
                </div>
                <button className="ghost" onClick={handleLeave}>
                    Salir de la sala
                </button>
            </div>

            {error && <p className="error-text">{error}</p>}
            {!joined && !error && <p className="muted">Conectando…</p>}

            <AnimatePresence>
                {secondsLeft !== null && secondsLeft > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="card countdown-banner"
                    >
                        La partida inicia en <span className="brand-title">{secondsLeft}</span>
                        {amHost && (
                            <button
                                className="ghost"
                                onClick={() => socket.emit('match:config', {})}
                            >
                                Cancelar
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="match-layout">
                <div className="match-main">
                    {matchState && matchState.phase !== 'LOBBY' ? (
                        <RadialTable
                            phase={matchState.phase}
                            players={roster}
                            selfId={matchState.yourId}
                            yourTopCard={matchState.yourTopCard}
                            round={roundView}
                            potSize={matchState.potSize}
                            winnerIdThisRound={lastResult?.winnerId}
                            onSelectAttribute={handleSelectAttribute}
                            onPlayCard={handlePlayCard}
                        />
                    ) : (
                        <div className="card">
                            <h3>Jugadores conectados</h3>
                            <div className="grid" style={{ marginTop: '0.75rem' }}>
                                {roster.map((player) => (
                                    <div key={player.id} className="row">
                                        <img
                                            className="avatar"
                                            src={`https://api.dicebear.com/9.x/identicon/svg?seed=${player.avatarSeed}`}
                                            alt=""
                                        />
                                        <span>{player.nickname}</span>
                                        <span className="faint">· {player.cardCount} cartas</span>
                                        {player.isEliminated && (
                                            <span className="muted">(eliminado)</span>
                                        )}
                                    </div>
                                ))}
                                {roster.length === 0 && (
                                    <p className="muted">Todavía nadie más se ha unido.</p>
                                )}
                            </div>

                            {amHost && (
                                <div className="stack" style={{ marginTop: '1rem' }}>
                                    {pendingRequests.length > 0 && (
                                        <div className="stack">
                                            <h4>Solicitudes pendientes</h4>
                                            {pendingRequests.map((request) => (
                                                <div key={request.requestId} className="spread">
                                                    <span>{request.nickname}</span>
                                                    <div className="row">
                                                        <button
                                                            className="primary"
                                                            onClick={() =>
                                                                respondJoin(request.requestId, true)
                                                            }
                                                        >
                                                            Aceptar
                                                        </button>
                                                        <button
                                                            className="ghost"
                                                            onClick={() =>
                                                                respondJoin(
                                                                    request.requestId,
                                                                    false,
                                                                )
                                                            }
                                                        >
                                                            Rechazar
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        className="primary"
                                        onClick={() => socket.emit('match:start')}
                                    >
                                        Iniciar partida
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <aside className="match-side">
                    <div className="card">
                        <h4>Posiciones</h4>
                        <ol className="standings-list" style={{ marginTop: '0.6rem' }}>
                            {[...roster]
                                .sort((a, b) => b.cardCount - a.cardCount)
                                .map((player, index) => (
                                    <motion.li
                                        layout
                                        key={player.id}
                                        className={
                                            player.id === matchState?.yourId ? 'self' : undefined
                                        }
                                    >
                                        <span className="standings-rank">#{index + 1}</span>
                                        <span className="standings-name">{player.nickname}</span>
                                        <span className="faint">{player.cardCount}</span>
                                    </motion.li>
                                ))}
                        </ol>
                    </div>

                    {roundLog.length > 0 && (
                        <div className="card">
                            <h4>Log de rondas</h4>
                            <div className="stack" style={{ marginTop: '0.6rem' }}>
                                {roundLog.map((entry) => {
                                    const winner = roster.find((p) => p.id === entry.winnerId);
                                    return (
                                        <div key={entry.index} className="round-log-entry">
                                            <span className="faint">Ronda {entry.index + 1}</span>
                                            <span>
                                                {entry.isTie
                                                    ? `Empate (${entry.attribute})`
                                                    : `${winner?.nickname ?? '—'} gana con ${entry.attribute}`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
