import type { RedactedMatchState } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useNow } from '../../hooks/useNow';
import { formatDuration } from '../../lib/format';
import {
    canNativeShare,
    copyToClipboard,
    emailUrl,
    inviteUrl,
    nativeShare,
    telegramUrl,
    whatsappUrl,
} from '../../lib/share';

interface WaitingRoomProps {
    state: RedactedMatchState;
    onStart: () => void;
    onCancelCountdown: () => void;
    onLeave: () => void;
}

/**
 * One centered card for every lobby: the room (or the search), the seats filling up as players
 * arrive, the rules in play and the countdown - so the wait reads as a single live screen.
 */
export function WaitingRoom({
    state,
    onStart,
    onCancelCountdown,
    onLeave,
}: WaitingRoomProps): JSX.Element {
    const { t } = useTranslation();
    const toast = useToast();
    const now = useNow(200, state.phase === 'COUNTDOWN');
    const isHost = state.hostId === state.yourId;
    const seated = state.players.filter((player) => !player.isSpectator);
    const emptySeats = Math.max(0, state.config.maxPlayers - seated.length);
    const isQuick = state.config.visibility === 'public';
    const canStart = seated.length >= state.config.minPlayers;
    const full = seated.length >= state.config.autoStartPlayers;
    const countdown =
        state.phase === 'COUNTDOWN' && state.countdownEndsAt
            ? Math.max(0, Math.ceil((state.countdownEndsAt - now) / 1000))
            : null;

    async function copy(text: string, what: string): Promise<void> {
        const copied = await copyToClipboard(text);
        toast.show(
            copied ? t('common.copied', { what }) : t('common.copyFailed'),
            copied ? 'success' : 'error',
        );
    }

    const title = isQuick
        ? full
            ? t('lobby.found')
            : t('lobby.searching')
        : t('lobby.inviteTitle');

    return (
        <div className="waiting">
            <motion.section
                className="panel panel--pad waiting__card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
            >
                <header className="waiting__head">
                    <span className="eyebrow">
                        {isQuick ? t('home.quick.title') : t('home.private.title')}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.h1
                            key={title}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.25 }}
                        >
                            {title}
                        </motion.h1>
                    </AnimatePresence>
                </header>

                {isQuick ? null : (
                    <div className="waiting__invite">
                        <button
                            type="button"
                            className="waiting__code"
                            onClick={() => void copy(state.code, t('lobby.code'))}
                            aria-label={t('lobby.copyCode', { code: state.code })}
                        >
                            {state.code}
                        </button>
                        <p className="text-3">{t('lobby.codeHint')}</p>
                        <div className="waiting__share">
                            <a
                                className="btn btn--emerald btn--sm"
                                href={whatsappUrl(state.code)}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                WhatsApp
                            </a>
                            <a
                                className="btn btn--sm"
                                href={telegramUrl(state.code)}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Telegram
                            </a>
                            <a className="btn btn--sm" href={emailUrl(state.code)}>
                                <Icon name="envelope" className="btn__icon" /> {t('lobby.email')}
                            </a>
                            <Button
                                size="sm"
                                icon="linked-rings"
                                onClick={() => void copy(inviteUrl(state.code), t('lobby.link'))}
                            >
                                {t('lobby.copyLink')}
                            </Button>
                            {canNativeShare() ? (
                                <Button
                                    size="sm"
                                    icon="share"
                                    onClick={() => void nativeShare(state.code)}
                                >
                                    {t('lobby.share')}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                )}

                <div className="waiting__seats" aria-label={t('lobby.players')}>
                    <div className="row row--between">
                        <h2>{t('lobby.players')}</h2>
                        <span className="badge tabular">
                            {seated.length}/{state.config.maxPlayers}
                        </span>
                    </div>
                    <ul className={`seat-grid ${isQuick ? 'seat-grid--duel' : ''}`}>
                        <AnimatePresence initial={false}>
                            {seated.map((player, index) => (
                                <motion.li
                                    key={player.id}
                                    className={`seat-slot ${player.id === state.yourId ? 'is-you' : ''}`}
                                    initial={{ opacity: 0, scale: 0.7, y: 12 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{
                                        type: 'spring',
                                        bounce: 0.35,
                                        duration: 0.55,
                                        delay: index * 0.04,
                                    }}
                                >
                                    <Avatar seed={player.avatarSeed} size={58} />
                                    <strong className="seat-slot__name">{player.nickname}</strong>
                                    <span className="text-3 seat-slot__role">
                                        {player.id === state.hostId && !isQuick
                                            ? t('lobby.host')
                                            : player.id === state.yourId
                                              ? t('common.you')
                                              : t('lobby.ready')}
                                    </span>
                                </motion.li>
                            ))}
                        </AnimatePresence>
                        {isQuick && emptySeats > 0 ? (
                            <li className="seat-slot seat-slot--searching" aria-live="polite">
                                <span className="waiting__radar" aria-hidden>
                                    <span />
                                    <span />
                                    <Icon name="crossed-swords" />
                                </span>
                                <span className="text-3">{t('lobby.searchingSeat')}</span>
                            </li>
                        ) : (
                            Array.from({ length: Math.min(emptySeats, 6) }, (_, index) => (
                                <li key={`empty-${index}`} className="seat-slot seat-slot--empty">
                                    <span className="seat-slot__placeholder">
                                        <Icon name="hooded-figure" />
                                    </span>
                                    <span className="text-3">{t('lobby.free')}</span>
                                </li>
                            ))
                        )}
                    </ul>
                </div>

                <div className="config-summary waiting__rules">
                    <span className="badge">
                        <Icon name="lightning-helix" /> Pokémon
                    </span>
                    <span className="badge badge--muted">
                        {t('common.cards', {
                            count: state.config.packs * state.config.cardsPerPack,
                        })}
                    </span>
                    <span className="badge badge--muted">
                        {formatDuration(state.config.matchDurationMs)}
                    </span>
                    {isQuick ? null : (
                        <span className="badge badge--muted">
                            {t('lobby.autoStart', { count: state.config.autoStartPlayers })}
                        </span>
                    )}
                </div>

                <AnimatePresence>
                    {countdown !== null ? (
                        <motion.div
                            className="countdown"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                        >
                            <span className="countdown__label">{t('lobby.startsIn')}</span>
                            <motion.span
                                key={countdown}
                                className="countdown__value"
                                initial={{ scale: 1.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', bounce: 0.4, duration: 0.5 }}
                            >
                                {countdown}
                            </motion.span>
                            {isHost && !isQuick ? (
                                <Button size="sm" variant="ghost" onClick={onCancelCountdown}>
                                    {t('lobby.cancel')}
                                </Button>
                            ) : null}
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                <div className="waiting__actions">
                    {!isQuick && isHost && state.phase === 'LOBBY' ? (
                        <Button
                            variant="gold"
                            size="lg"
                            block
                            icon="crossed-swords"
                            disabled={!canStart}
                            onClick={onStart}
                        >
                            {canStart
                                ? t('lobby.start')
                                : t('lobby.missing', {
                                      count: state.config.minPlayers - seated.length,
                                  })}
                        </Button>
                    ) : !isQuick && state.phase === 'LOBBY' ? (
                        <p className="text-2 waiting__note">{t('lobby.waitHost')}</p>
                    ) : null}
                    <Button variant="ghost" block icon="exit-door" onClick={onLeave}>
                        {isQuick && !full
                            ? t('lobby.stopSearching')
                            : isHost && !isQuick
                              ? t('lobby.closeRoom')
                              : t('lobby.leave')}
                    </Button>
                </div>
            </motion.section>
        </div>
    );
}
