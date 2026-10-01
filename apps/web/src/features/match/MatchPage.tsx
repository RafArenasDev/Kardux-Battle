import type { RedactedMatchState } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import type { Breakpoint } from '../../hooks/useBreakpoint';
import { useBreakpoint, useMediaQuery } from '../../hooks/useBreakpoint';
import { useDocumentTitle, useNow } from '../../hooks/useNow';
import { formatClock } from '../../lib/format';
import { tryEnterFullscreen, tryLockMatchOrientation } from '../../lib/matchFullscreen';
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
    // A phone rotated to landscape measures wide enough to read as `tablet` by width alone -
    // but its height is still phone-short, and tablet's layout (bigger cards, a full seat pill)
    // assumes real headroom in both dimensions that a rotated phone never has. The table's own
    // breakpoint downgrades to `mobile` whenever the *shorter* of the two dimensions is
    // phone-sized, regardless of which axis that turns out to be - matching the media query
    // above matches if EITHER axis is under the tablet threshold. Everywhere else in the app
    // (WaitingRoom, HomePage, ...) keeps using the plain `breakpoint` above, untouched.
    const isPhoneSized = useMediaQuery('(max-width: 767px), (max-height: 767px)');
    const tableBreakpoint: Breakpoint = isPhoneSized ? 'mobile' : breakpoint;
    const showError = useCallback((message: string) => toast.show(message, 'error'), [toast]);
    const session = useMatchSession(matchId, showError);
    const { state, quickRematch } = session;
    const [sheetOpen, setSheetOpen] = useState(false);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    useBodyScrollLock(sheetOpen);
    useBodyScrollLock(confirmLeave);
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

    const sideInline = tableBreakpoint === 'desktop';
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

    // `!state` counts as "in lobby" too - before the first `match:state` socket update arrives,
    // `state` is still null, and `state?.phase` reads as undefined, which used to make this false
    // for one render. That spuriously flipped `matchOrientationActive` below true→false right as
    // the real lobby loaded, running its effect's cleanup and exiting the fullscreen the entry
    // tap had just (correctly) acquired - confirmed on a real phone via a frame-by-frame video:
    // fullscreen visibly drops the instant "¡Rival encontrado!" replaces the loading state, and
    // every later re-entry attempt fires from a React effect, not a gesture, so it silently fails
    // for the rest of the match.
    const inLobby = !state || state.phase === 'LOBBY' || state.phase === 'COUNTDOWN';
    // Chat only makes sense between real people - a practice match against the machine never
    // gets a chat tab/button, there is nobody on the other end of it.
    const allowChat = !state?.players.some((player) => player.id.startsWith('bot:'));

    // Phones only, and only once the match itself is on screen - never the lobby/countdown wait,
    // which stays in whatever orientation the player is already holding the phone in. Entering
    // fullscreen+landscape exactly when the table loads (not a moment sooner) is a deliberate,
    // explicit requirement: a quick-match search or a private lobby's wait is a normal portrait
    // screen, and only the table itself ever asks for landscape, the same way a video player only
    // goes fullscreen when you tap its own button, never a "please rotate your device" message.
    // Both calls need a real permission the browser can refuse (most reliably on iOS Safari,
    // which never lets a plain web page lock orientation at all) - best effort, silent either
    // way, since the table's own layout has to work in portrait regardless. An installed PWA
    // already owns the whole screen, so requestFullscreen is normally a harmless no-op there.
    //
    // `session.finished` is also a release condition, not just `inLobby`: the result screen
    // (`FinishOverlay`) renders as an overlay ON TOP of the still-mounted table, it doesn't send
    // `state.phase` back to LOBBY/COUNTDOWN - without this, the phone stayed locked in fullscreen
    // landscape through the whole result screen and only released once the player actually
    // tapped away, instead of the moment the match itself ends.
    const matchOrientationActive = !inLobby && tableBreakpoint === 'mobile' && !session.finished;
    useEffect(() => {
        if (!matchOrientationActive) return undefined;

        tryLockMatchOrientation();

        return () => {
            try {
                screen.orientation?.unlock?.();
            } catch {
                /* ignore */
            }
            if (document.fullscreenElement) {
                void document.exitFullscreen?.().catch(() => undefined);
            }
        };
    }, [matchOrientationActive]);

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
            accountAction={
                state && !inLobby
                    ? {
                          icon: 'exit-door',
                          label: t('table.leave.button'),
                          onClick: () => setConfirmLeave(true),
                      }
                    : undefined
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
                        onStart={() => {
                            // Synchronous, before session.start()'s own fire-and-forget emit -
                            // see matchFullscreen.ts's own comment. The host's "Listo" tap is the
                            // most reliable entry point for a private room: create/join can both
                            // happen long before this, well outside any gesture window by then.
                            tryEnterFullscreen();
                            session.start();
                        }}
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
                            breakpoint={tableBreakpoint}
                            onSelectAttribute={session.selectAttribute}
                        />

                        <div className="match__tools">
                            {tableBreakpoint === 'mobile' ? (
                                <ToolsMenu
                                    allowChat={allowChat}
                                    unread={unread}
                                    onRules={() => setRulesOpen(true)}
                                    onChat={() => setSheetOpen(true)}
                                />
                            ) : (
                                <>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        icon="scroll-unfurled"
                                        aria-label={t('rules.open')}
                                        data-tip={t('rules.open')}
                                        data-tip-pos="bottom"
                                        onClick={() => setRulesOpen(true)}
                                    />
                                    {!sideInline && allowChat ? (
                                        <span className="tool-with-dot">
                                            <Button
                                                size="sm"
                                                icon="chat-bubble"
                                                onClick={() => setSheetOpen(true)}
                                                aria-label={t('panel.open')}
                                            >
                                                {t('panel.open')}
                                            </Button>
                                            {unread > 0 ? (
                                                <span className="unread-dot unread-dot--floating">
                                                    {unread}
                                                </span>
                                            ) : null}
                                        </span>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </div>

                    {sideInline ? (
                        panel
                    ) : tableBreakpoint === 'mobile' ? (
                        // Phones: a centered modal, not a drag-to-dismiss sheet anchored to the
                        // table's bottom edge - that read as "the table itself scrolls", which
                        // is exactly what this table goes out of its way to never do.
                        <AnimatePresence>
                            {sheetOpen ? (
                                <motion.div
                                    key="scrim"
                                    className="dialog-scrim"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setSheetOpen(false)}
                                >
                                    <motion.div
                                        key="dialog"
                                        className="dialog panel panel--pad side-panel-dialog"
                                        role="dialog"
                                        aria-modal="true"
                                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 24, scale: 0.97 }}
                                        transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <div className="row row--between">
                                            <h2>{t('panel.label')}</h2>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                icon="cancel"
                                                aria-label={t('common.close')}
                                                onClick={() => setSheetOpen(false)}
                                            />
                                        </div>
                                        <div className="dialog__body">{panel}</div>
                                    </motion.div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
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
            {state && confirmLeave
                ? createPortal(
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
                      </div>,
                      document.body,
                  )
                : null}
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

/** Phones: "cómo se juega" and "chat/posiciones" collapse into one kebab menu instead of two
 *  separate floating buttons crowding the table's corner - the table itself needed that room
 *  back far more than either control needed to stay one tap away instead of two. */
function ToolsMenu({
    allowChat,
    unread,
    onRules,
    onChat,
}: {
    allowChat: boolean;
    unread: number;
    onRules: () => void;
    onChat: () => void;
}): JSX.Element {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    return (
        <div className="tools-menu">
            <span className="tool-with-dot">
                <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('table.tools.more')}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((value) => !value)}
                >
                    <svg
                        viewBox="0 0 24 24"
                        className="btn__icon"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <circle cx="5" cy="12" r="2.2" fill="currentColor" />
                        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                        <circle cx="19" cy="12" r="2.2" fill="currentColor" />
                    </svg>
                </Button>
                {!open && unread > 0 ? (
                    <span className="unread-dot unread-dot--floating">{unread}</span>
                ) : null}
            </span>
            {open ? (
                <>
                    <div className="tools-menu__backdrop" onClick={() => setOpen(false)} />
                    <div className="tools-menu__panel" role="menu">
                        <button
                            type="button"
                            role="menuitem"
                            className="tools-menu__item"
                            onClick={() => {
                                setOpen(false);
                                onRules();
                            }}
                        >
                            <Icon name="scroll-unfurled" /> {t('rules.open')}
                        </button>
                        {allowChat ? (
                            <button
                                type="button"
                                role="menuitem"
                                className="tools-menu__item"
                                onClick={() => {
                                    setOpen(false);
                                    onChat();
                                }}
                            >
                                <Icon name="chat-bubble" /> {t('panel.open')}
                                {unread > 0 ? <span className="unread-dot">{unread}</span> : null}
                            </button>
                        ) : null}
                    </div>
                </>
            ) : null}
        </div>
    );
}
