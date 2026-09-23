import type { RedactedMatchState } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../lib/i18n';
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

const QUICK_REMATCH_EVERY_MS = 4_000;

export default function MatchPage(): JSX.Element {
    const { matchId = '' } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const breakpoint = useBreakpoint();
    const showError = useCallback((message: string) => toast.show(message, 'error'), [toast]);
    const session = useMatchSession(matchId, showError);
    const { state, quickRematch } = session;
    const [sheetOpen, setSheetOpen] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);

    const isQuick = state?.config.visibility === 'public';
    // The tab shows only the game - plus the room code for private rooms, never a player name.
    useDocumentTitle(state && !isQuick ? `Sala ${state.code}` : '');

    useEffect(() => {
        if (session.fatalError) {
            toast.show(session.fatalError, 'error');
            navigate('/home', { replace: true });
        }
    }, [session.fatalError, navigate, toast]);

    // Alone in a quick lobby: keep asking the server for someone else who is searching.
    const aloneInQuickLobby =
        isQuick &&
        state?.phase === 'LOBBY' &&
        state.players.filter((player) => !player.isSpectator).length < 2;
    useEffect(() => {
        if (!aloneInQuickLobby) return;
        const timer = window.setInterval(() => {
            void quickRematch().then((nextMatchId) => {
                if (nextMatchId && nextMatchId !== matchId) {
                    navigate(`/match/${nextMatchId}`, { replace: true });
                }
            });
        }, QUICK_REMATCH_EVERY_MS);
        return () => window.clearInterval(timer);
    }, [aloneInQuickLobby, quickRematch, matchId, navigate]);

    function leave(): void {
        session.leave();
        navigate('/home', { replace: true });
    }

    const inLobby = state?.phase === 'LOBBY' || state?.phase === 'COUNTDOWN';
    const sideInline = breakpoint === 'desktop';

    return (
        <AppShell
            immersive
            headerExtra={state && !inLobby ? <MatchHud state={state} showCode={!isQuick} /> : null}
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
                        />

                        <div className="match__tools">
                            {!sideInline ? (
                                <Button
                                    size="sm"
                                    icon="podium-winner"
                                    onClick={() => setSheetOpen(true)}
                                    aria-label="Posiciones y chat"
                                >
                                    {breakpoint === 'mobile' ? undefined : 'Mesa y chat'}
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
                                    aria-label="Abandonar"
                                    onClick={() => setConfirmLeave(true)}
                                >
                                    {breakpoint === 'mobile' ? undefined : 'Abandonar'}
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
                                        key="scrim"
                                        className="sheet-scrim"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={() => setSheetOpen(false)}
                                    />
                                    <motion.div
                                        key="sheet"
                                        className="sheet"
                                        initial={{ y: '100%' }}
                                        animate={{ y: 0 }}
                                        exit={{ y: '100%' }}
                                        transition={{ type: 'spring', bounce: 0.12, duration: 0.5 }}
                                        drag="y"
                                        dragConstraints={{ top: 0, bottom: 0 }}
                                        dragElastic={{ top: 0.05, bottom: 0.8 }}
                                        onDragEnd={(_, info) => {
                                            if (info.offset.y > 120 || info.velocity.y > 600) {
                                                setSheetOpen(false);
                                            }
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
    showCode,
}: {
    state: RedactedMatchState;
    showCode: boolean;
}): JSX.Element {
    const now = useNow(1_000, state.endsAt !== null);
    const { t } = useI18n();

    return (
        <div className="hud" role="group" aria-label={t('Estado de la partida', 'Match status')}>
            {showCode ? (
                <span
                    className="hud__item"
                    data-tip={t('Código de sala', 'Room code')}
                    data-tip-pos="bottom"
                >
                    <Icon name="linked-rings" /> {state.code}
                </span>
            ) : null}
            {state.round ? (
                <span className="hud__item" data-tip={t('Ronda', 'Round')} data-tip-pos="bottom">
                    <Icon name="card-play" /> {t('Ronda', 'Round')} {state.round.index + 1}
                </span>
            ) : null}
            <span
                className="hud__item tabular"
                data-tip={t('Tiempo restante', 'Time left')}
                data-tip-pos="bottom"
            >
                <Icon name={state.endsAt ? 'stopwatch' : 'infinity'} />{' '}
                {state.endsAt ? formatClock(state.endsAt - now) : t('Sin límite', 'No limit')}
            </span>
        </div>
    );
}
