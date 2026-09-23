import type { RedactedMatchState } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useDocumentTitle, useNow } from '../../hooks/useNow';
import { formatClock } from '../../lib/format';
import { FinishOverlay } from './FinishOverlay';
import { GameTable } from './GameTable';
import { SidePanel } from './SidePanel';
import { useMatchSession } from './useMatchSession';
import { WaitingRoom } from './WaitingRoom';

export default function MatchPage(): JSX.Element {
    const { matchId = '' } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const breakpoint = useBreakpoint();
    const showError = useCallback((message: string) => toast.show(message, 'error'), [toast]);
    const session = useMatchSession(matchId, showError);
    const { state } = session;
    const [sheetOpen, setSheetOpen] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);

    const me = state?.players.find((player) => player.id === state.yourId);
    useDocumentTitle(state ? `${me?.nickname ?? 'Sala'} · ${state.code}` : 'Partida');

    useEffect(() => {
        if (session.fatalError) {
            toast.show(session.fatalError, 'error');
            navigate('/home', { replace: true });
        }
    }, [session.fatalError, navigate, toast]);

    function leave(): void {
        session.leave();
        navigate('/home', { replace: true });
    }

    const inLobby = state?.phase === 'LOBBY' || state?.phase === 'COUNTDOWN';
    const sideInline = breakpoint === 'desktop';

    return (
        <AppShell
            immersive
            headerExtra={
                state && !inLobby ? <MatchHud state={state} latency={session.latency} /> : null
            }
        >
            {!state ? (
                <div className="page-loading" role="status">
                    <span className="spinner" style={{ ['--size' as string]: '40px' }} />
                    <p className="text-2">Entrando a la mesa…</p>
                </div>
            ) : inLobby ? (
                <div className="match-lobby">
                    <WaitingRoom
                        state={state}
                        onStart={session.start}
                        onCancelCountdown={session.cancelCountdown}
                        onLeave={leave}
                    />
                </div>
            ) : (
                <div className={`match ${sideInline ? 'match--with-side' : ''}`}>
                    <div className="match__table">
                        <GameTable
                            state={state}
                            reveal={session.reveal}
                            dealing={session.dealing}
                            myPlayedCard={session.myPlayedCard}
                            breakpoint={breakpoint}
                            onSelectAttribute={session.selectAttribute}
                            onPlayCard={session.playCard}
                        />

                        <div className="match__tools">
                            {!sideInline ? (
                                <Button
                                    size="sm"
                                    icon="podium-winner"
                                    onClick={() => setSheetOpen(true)}
                                >
                                    Mesa y chat
                                </Button>
                            ) : null}
                            {confirmLeave ? (
                                <div
                                    className="leave-confirm"
                                    role="alertdialog"
                                    aria-label="Confirmar salida"
                                >
                                    <span>¿Abandonar? Perderás tus cartas.</span>
                                    <Button size="sm" variant="ruby" onClick={leave}>
                                        Salir
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setConfirmLeave(false)}
                                    >
                                        Seguir
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="exit-door"
                                    onClick={() => setConfirmLeave(true)}
                                >
                                    Abandonar
                                </Button>
                            )}
                        </div>
                    </div>

                    {sideInline ? (
                        <SidePanel state={state} chat={session.chat} onSend={session.sendChat} />
                    ) : (
                        <AnimatePresence>
                            {sheetOpen ? (
                                <>
                                    <motion.div
                                        className="sheet-scrim"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={() => setSheetOpen(false)}
                                    />
                                    <motion.div
                                        className="sheet"
                                        initial={{ y: '100%' }}
                                        animate={{ y: 0 }}
                                        exit={{ y: '100%' }}
                                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                                        drag="y"
                                        dragConstraints={{ top: 0, bottom: 0 }}
                                        dragElastic={{ top: 0.05, bottom: 0.8 }}
                                        onDragEnd={(_, info) => {
                                            if (info.offset.y > 120 || info.velocity.y > 600)
                                                setSheetOpen(false);
                                        }}
                                    >
                                        <span className="sheet__handle" aria-hidden />
                                        <SidePanel
                                            state={state}
                                            chat={session.chat}
                                            onSend={session.sendChat}
                                        />
                                    </motion.div>
                                </>
                            ) : null}
                        </AnimatePresence>
                    )}
                </div>
            )}

            {session.status === 'lost' ? (
                <div className="reconnecting" role="status">
                    <span className="spinner" /> Reconectando…
                </div>
            ) : null}

            <AnimatePresence>
                {state && session.finished ? (
                    <FinishOverlay
                        state={state}
                        finished={session.finished}
                        onHome={() => navigate('/home', { replace: true })}
                        onPlayAgain={() =>
                            navigate('/home', { replace: true, state: { quick: true } })
                        }
                    />
                ) : null}
            </AnimatePresence>
        </AppShell>
    );
}

function MatchHud({
    state,
    latency,
}: {
    state: RedactedMatchState;
    latency: number | null;
}): JSX.Element {
    const now = useNow(1_000, state.endsAt !== null);

    return (
        <div className="hud" role="group" aria-label="Estado de la partida">
            <span className="hud__item" title="Código de sala">
                <Icon name="linked-rings" /> {state.code}
            </span>
            {state.round ? (
                <span className="hud__item" title="Ronda">
                    <Icon name="card-play" /> Ronda {state.round.index + 1}
                </span>
            ) : null}
            {state.endsAt ? (
                <span className="hud__item tabular" title="Tiempo restante">
                    <Icon name="stopwatch" /> {formatClock(state.endsAt - now)}
                </span>
            ) : null}
            {latency !== null ? (
                <span
                    className={`hud__item hud__ping ${latency > 250 ? 'is-slow' : ''}`}
                    title="Latencia"
                >
                    {latency} ms
                </span>
            ) : null}
        </div>
    );
}
