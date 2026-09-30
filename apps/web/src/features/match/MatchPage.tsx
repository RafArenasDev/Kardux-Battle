import type { RedactedMatchState } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useDocumentTitle, useNow } from '../../hooks/useNow';
import { formatClock } from '../../lib/format';
import { RulesDialog } from '../rules/RulesDialog';
import { FinishOverlay } from './FinishOverlay';
import { GameTable } from './GameTable';
import type { PanelTab } from './SidePanel';
import { SidePanel } from './SidePanel';
import { leaveMatch, useMatchSession } from './useMatchSession';
import { WaitingRoom } from './WaitingRoom';

const QUICK_REMATCH_EVERY_MS = 4_000;

/** The match page currently on screen. Leaving the route (back button, a link) is the same as
 *  pressing "Abandonar"; the check survives React's development double-mount. */
let mountedMatchId: string | null = null;

export default function MatchPage(): JSX.Element {
    const { t } = useTranslation();
    const { matchId = '' } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const breakpoint = useBreakpoint();
    const showError = useCallback((message: string) => toast.show(message, 'error'), [toast]);
    const session = useMatchSession(matchId, showError);
    const { state, quickRematch } = session;
    const [sheetOpen, setSheetOpen] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [tab, setTab] = useState<PanelTab>('standings');
    const [seenMessages, setSeenMessages] = useState(0);
    const leftOnPurpose = useRef(false);

    const isQuick = state?.config.visibility === 'public';
    useDocumentTitle(state && !isQuick ? t('join.room', { code: state.code }) : '');

    useEffect(() => {
        mountedMatchId = matchId;
        return () => {
            mountedMatchId = null;
            window.setTimeout(() => {
                if (mountedMatchId !== matchId && !leftOnPurpose.current) leaveMatch();
            }, 0);
        };
    }, [matchId]);

    useEffect(() => {
        if (session.fatalError) {
            leftOnPurpose.current = true;
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
                    leftOnPurpose.current = true;
                    navigate(`/match/${nextMatchId}`, { replace: true });
                }
            });
        }, QUICK_REMATCH_EVERY_MS);
        return () => window.clearInterval(timer);
    }, [aloneInQuickLobby, quickRematch, matchId, navigate]);

    const sideInline = breakpoint === 'desktop';
    const chatVisible = tab === 'chat' && (sideInline || sheetOpen);
    useEffect(() => {
        if (chatVisible) setSeenMessages(session.chat.length);
    }, [chatVisible, session.chat.length]);
    const unread = Math.max(0, session.chat.length - seenMessages);

    function leave(): void {
        leftOnPurpose.current = true;
        session.leave();
        navigate('/home', { replace: true });
    }

    function exitFinished(quick: boolean): void {
        leftOnPurpose.current = true;
        session.leave();
        navigate('/home', { replace: true, state: quick ? { quick: true } : null });
    }

    const inLobby = state?.phase === 'LOBBY' || state?.phase === 'COUNTDOWN';
    const panel = state ? (
        <SidePanel
            state={state}
            chat={session.chat}
            tab={tab}
            onTab={setTab}
            unread={unread}
            dealing={session.dealing}
            frozen={session.frozen}
            onSend={session.sendChat}
        />
    ) : null;

    return (
        <AppShell
            immersive
            headerExtra={
                state && !inLobby ? (
                    <MatchHud
                        state={state}
                        showCode={!isQuick}
                        revealIndex={session.reveal?.result.index ?? null}
                    />
                ) : null
            }
        >
            {!state ? (
                <div className="page-loading" role="status">
                    <span className="spinner" style={{ ['--size' as string]: '40px' }} />
                    <p className="text-2">{t('table.entering')}</p>
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
                            frozen={session.frozen}
                            dealing={session.dealing}
                            myPlayedCard={session.myPlayedCard}
                            breakpoint={breakpoint}
                            onSelectAttribute={session.selectAttribute}
                        />

                        <div className="match__tools">
                            <Button
                                size="sm"
                                variant="ghost"
                                icon="scroll-unfurled"
                                aria-label={t('rules.open')}
                                data-tip={t('rules.open')}
                                data-tip-pos="bottom"
                                onClick={() => setRulesOpen(true)}
                            />
                            {!sideInline ? (
                                <span className="tool-with-dot">
                                    <Button
                                        size="sm"
                                        icon="chat-bubble"
                                        onClick={() => setSheetOpen(true)}
                                        aria-label={t('panel.open')}
                                    >
                                        {breakpoint === 'mobile' ? undefined : t('panel.open')}
                                    </Button>
                                    {unread > 0 ? (
                                        <span className="unread-dot unread-dot--floating">
                                            {unread}
                                        </span>
                                    ) : null}
                                </span>
                            ) : null}
                            {confirmLeave ? (
                                <div className="dialog-overlay">
                                    <div
                                        className="leave-confirm"
                                        role="alertdialog"
                                        aria-label={t('table.leave.confirm')}
                                    >
                                        <span>
                                            {state.players.filter((p) => !p.isSpectator).length <= 2
                                                ? t('table.leave.duel')
                                                : t('table.leave.table')}
                                        </span>
                                        <div className="leave-confirm__actions">
                                            <Button size="sm" variant="ruby" onClick={leave}>
                                                {t('table.leave.yes')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setConfirmLeave(false)}
                                            >
                                                {t('table.leave.no')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="exit-door"
                                    aria-label={t('table.leave.button')}
                                    onClick={() => setConfirmLeave(true)}
                                >
                                    {breakpoint === 'mobile' ? undefined : t('table.leave.button')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {sideInline ? (
                        panel
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
                                        {panel}
                                    </motion.div>
                                </>
                            ) : null}
                        </AnimatePresence>
                    )}
                </div>
            )}

            {session.status === 'lost' ? (
                <div className="reconnecting" role="status">
                    <span className="spinner" /> {t('table.reconnecting')}
                </div>
            ) : null}

            <AnimatePresence>
                {state && session.finished ? (
                    <FinishOverlay
                        state={state}
                        finished={session.finished}
                        onHome={() => exitFinished(false)}
                        onPlayAgain={() => exitFinished(true)}
                    />
                ) : null}
            </AnimatePresence>
            <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
        </AppShell>
    );
}

function MatchHud({
    state,
    showCode,
    revealIndex,
}: {
    /** While a round is being revealed, the HUD still shows that round. */
    revealIndex: number | null;
    state: RedactedMatchState;
    showCode: boolean;
}): JSX.Element {
    const now = useNow(1_000, state.endsAt !== null);
    const { t } = useTranslation();

    return (
        <div className="hud" role="group" aria-label={t('table.hud')}>
            {showCode ? (
                <span
                    className="hud__item hud__item--code"
                    data-tip={t('home.join.code')}
                    data-tip-pos="bottom"
                >
                    <Icon name="linked-rings" /> {state.code}
                </span>
            ) : null}
            <span className="hud__item" data-tip={t('table.round')} data-tip-pos="bottom">
                <Icon name="card-play" />{' '}
                {t('table.roundNumber', {
                    count:
                        revealIndex !== null
                            ? revealIndex + 1
                            : state.round
                              ? state.round.index + 1
                              : state.roundsPlayed + 1,
                })}
            </span>
            <span
                className="hud__item tabular"
                data-tip={t('table.timeLeft')}
                data-tip-pos="bottom"
            >
                <Icon name={state.endsAt ? 'stopwatch' : 'infinity'} />{' '}
                {state.endsAt ? formatClock(state.endsAt - now) : t('format.noLimit')}
            </span>
        </div>
    );
}
