import type { MatchSummaryWithRole } from '@kardux/contracts';
import { motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useNow';
import { listMyMatches } from '../../lib/api';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { clearSession, getUser, isGuest } from '../../lib/session';
import { extractRoomCode, readClipboardCode } from '../../lib/share';
import { disconnectGameSocket, whenConnected } from '../../lib/socket';
import { RulesDialog } from '../rules/RulesDialog';
import { Leaderboard } from './Leaderboard';

const CODE_PATTERN = /^[0-9A-F]{6}$/;

const cardMotion = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
};

export default function HomePage(): JSX.Element {
    const { t } = useTranslation();
    useDocumentTitle('');
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const user = getUser();
    const guest = isGuest();

    const [rooms, setRooms] = useState<MatchSummaryWithRole[]>([]);
    const [code, setCode] = useState('');
    const [quickBusy, setQuickBusy] = useState<'rival' | 'bot' | null>(null);
    const [rulesOpen, setRulesOpen] = useState(false);

    useEffect(() => {
        if (guest) return;
        let cancelled = false;
        listMyMatches()
            .then(
                (list) => !cancelled && setRooms(list.filter((room) => room.status !== 'FINISHED')),
            )
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [guest]);

    async function quickMatch(vsBot = false): Promise<void> {
        setQuickBusy(vsBot ? 'bot' : 'rival');
        try {
            const socket = await whenConnected();
            const ack = await socket.timeout(10_000).emitWithAck('match:quick', { vsBot });
            if (isErrorPayload(ack)) throw ack;
            navigate(`/match/${ack.matchId}`);
        } catch (error) {
            toast.show(errorMessage(error), 'error');
        } finally {
            setQuickBusy(null);
        }
    }

    // "Otra partida rápida" from the end-of-match screen lands here and queues right away.
    const wantsQuick = (location.state as { quick?: boolean } | null)?.quick === true;
    useEffect(() => {
        if (!wantsQuick) return;
        navigate('/home', { replace: true, state: null });
        void quickMatch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wantsQuick]);

    async function pasteCode(): Promise<void> {
        const pasted = await readClipboardCode();
        if (pasted) setCode(pasted);
        else toast.show(t('home.join.noClipboard'), 'error');
    }

    function joinByCode(event: FormEvent): void {
        event.preventDefault();
        if (CODE_PATTERN.test(code)) navigate(`/join/${code}`);
    }

    function goRegister(): void {
        disconnectGameSocket();
        clearSession();
        navigate('/', { replace: true });
    }

    return (
        <AppShell>
            <div className="home">
                <section className="home__hero">
                    {user ? <Avatar seed={user.avatarSeed} size={64} /> : null}
                    <div className="home__hero-text">
                        <span className="eyebrow">{t('home.eyebrow')}</span>
                        <h1>{t('home.greeting', { name: user?.nickname ?? '' })}</h1>
                    </div>
                    <Button
                        variant="ghost"
                        icon="scroll-unfurled"
                        onClick={() => setRulesOpen(true)}
                    >
                        {t('rules.open')}
                    </Button>
                </section>

                <section className="home__actions" aria-label={t('home.play')}>
                    <motion.article
                        className="panel action-card action-card--quick"
                        {...cardMotion}
                    >
                        <span className="action-card__icon">
                            <Icon name="lightning-helix" />
                        </span>
                        <div className="action-card__body">
                            <h2>{t('home.quick.title')}</h2>
                            <p className="text-2">{t('home.quick.text')}</p>
                        </div>
                        <div className="action-card__buttons">
                            <Button
                                variant="gold"
                                icon="crossed-swords"
                                loading={quickBusy === 'rival'}
                                disabled={quickBusy !== null}
                                onClick={() => void quickMatch(false)}
                            >
                                {t('home.quick.rival')}
                            </Button>
                            <Button
                                variant="ghost"
                                icon="dice-six-faces-five"
                                loading={quickBusy === 'bot'}
                                disabled={quickBusy !== null}
                                onClick={() => void quickMatch(true)}
                            >
                                {t('home.quick.bot')}
                            </Button>
                        </div>
                        <Icon name="sword-clash" className="action-card__watermark" />
                    </motion.article>

                    <motion.article
                        className="panel action-card"
                        {...cardMotion}
                        transition={{ delay: 0.05 }}
                    >
                        <span className="action-card__icon">
                            <Icon name="card-draw" />
                        </span>
                        <div className="action-card__body">
                            <h2>{t('home.private.title')}</h2>
                            <p className="text-2">{t('home.private.text')}</p>
                        </div>
                        <div className="action-card__buttons">
                            {guest ? (
                                <Button variant="ghost" icon="visored-helm" onClick={goRegister}>
                                    {t('home.private.register')}
                                </Button>
                            ) : (
                                <Button
                                    variant="emerald"
                                    icon="card-draw"
                                    onClick={() => navigate('/create')}
                                >
                                    {t('home.private.create')}
                                </Button>
                            )}
                        </div>
                        <Icon name="card-draw" className="action-card__watermark" />
                    </motion.article>

                    <motion.article
                        className="panel action-card"
                        {...cardMotion}
                        transition={{ delay: 0.1 }}
                    >
                        <span className="action-card__icon">
                            <Icon name="linked-rings" />
                        </span>
                        <div className="action-card__body">
                            <h2>{t('home.join.title')}</h2>
                            <p className="text-2">{t('home.join.text')}</p>
                        </div>
                        <form className="action-card__form" onSubmit={joinByCode}>
                            <label className="sr-only" htmlFor="join-code">
                                {t('home.join.code')}
                            </label>
                            <input
                                id="join-code"
                                className="input input--code"
                                placeholder="A3F9C1"
                                inputMode="text"
                                autoComplete="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                maxLength={64}
                                value={code}
                                onChange={(event) =>
                                    setCode(
                                        extractRoomCode(event.target.value) ??
                                            event.target.value
                                                .toUpperCase()
                                                .replace(/[^0-9A-F]/g, '')
                                                .slice(0, 6),
                                    )
                                }
                            />
                            <div className="join-row">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    icon="card-pickup"
                                    onClick={pasteCode}
                                >
                                    {t('home.join.paste')}
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={!CODE_PATTERN.test(code)}
                                    icon="magic-portal"
                                >
                                    {t('home.join.submit')}
                                </Button>
                            </div>
                        </form>
                        <Icon name="linked-rings" className="action-card__watermark" />
                    </motion.article>
                </section>

                <section className="home__grid">
                    <div className="panel panel--pad stack home__panel">
                        <div className="row row--between">
                            <h3>{t('home.rooms.title')}</h3>
                            {!guest ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="card-draw"
                                    onClick={() => navigate('/create')}
                                >
                                    {t('home.rooms.new')}
                                </Button>
                            ) : null}
                        </div>
                        {guest ? (
                            <div className="empty-state">
                                <Icon name="hooded-figure" />
                                <p>{t('home.rooms.guest')}</p>
                            </div>
                        ) : rooms.length === 0 ? (
                            <div className="empty-state">
                                <Icon name="card-draw" />
                                <p>{t('home.rooms.empty')}</p>
                            </div>
                        ) : (
                            <ul className="room-list home__scroll">
                                {rooms.map((room) => (
                                    <li key={room.matchId} className="room-item">
                                        <span className="room-item__code">{room.code}</span>
                                        <span className="room-item__meta">
                                            <strong>
                                                {t('common.players', {
                                                    count: room.playerCount,
                                                })}{' '}
                                                / {room.config.maxPlayers}
                                            </strong>
                                            <span className="text-3">
                                                {t(`home.rooms.status.${room.status}`)}
                                            </span>
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="gold"
                                            onClick={() => navigate(`/join/${room.code}`)}
                                        >
                                            {t('home.rooms.open')}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <Leaderboard meId={user?.id ?? null} />
                </section>
            </div>
            <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
        </AppShell>
    );
}
