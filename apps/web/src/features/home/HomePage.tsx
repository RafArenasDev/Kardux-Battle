import type { LeaderboardEntry, MatchSummary, MatchSummaryWithRole } from '@kardux/contracts';
import type { DeckSourceId } from '@kardux/contracts';
import { DECK_CATALOG, getDeckInfo } from '@kardux/content';
import { motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { ChoiceChips } from '../../components/ui/Segmented';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useNow';
import { deleteMatch, getActiveMatch, getLeaderboard, listMyMatches } from '../../lib/api';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { clearSession, getUser, isGuest } from '../../lib/session';
import { extractRoomCode, readClipboardCode } from '../../lib/share';
import { disconnectGameSocket, whenConnected } from '../../lib/socket';
import { useI18n } from '../../lib/i18n';

const CODE_PATTERN = /^[0-9A-F]{6}$/;

const STATUS_LABEL: Record<MatchSummary['status'], [string, string]> = {
    LOBBY: ['En sala', 'In lobby'],
    IN_PROGRESS: ['Jugando', 'Playing'],
    FINISHED: ['Terminada', 'Finished'],
};

const cardMotion = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
};

export default function HomePage(): JSX.Element {
    const { l, t } = useI18n();
    useDocumentTitle('');
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const user = getUser();
    const guest = isGuest();

    const [active, setActive] = useState<MatchSummary | null>(null);
    const [rooms, setRooms] = useState<MatchSummaryWithRole[]>([]);
    const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
    const [code, setCode] = useState('');
    const [quickBusy, setQuickBusy] = useState<'rival' | 'bot' | null>(null);
    const [quickDeck, setQuickDeck] = useState<DeckSourceId | 'random'>('random');

    useEffect(() => {
        let cancelled = false;
        getActiveMatch()
            .then((match) => !cancelled && setActive(match))
            .catch(() => undefined);
        if (!guest) {
            listMyMatches()
                .then((list) => !cancelled && setRooms(list))
                .catch(() => undefined);
        }
        getLeaderboard()
            .then((page) => !cancelled && setLeaders(page.entries))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [guest]);

    async function quickMatch(vsBot = false): Promise<void> {
        setQuickBusy(vsBot ? 'bot' : 'rival');
        try {
            const socket = await whenConnected();
            const ack = await socket.timeout(10_000).emitWithAck('match:quick', {
                vsBot,
                ...(quickDeck === 'random' ? {} : { deck: quickDeck }),
            });
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

    async function removeActive(): Promise<void> {
        if (!active) return;
        const isHost = active.hostId === user?.id;
        try {
            await deleteMatch(active.matchId);
            setActive(null);
            setRooms((current) => current.filter((room) => room.matchId !== active.matchId));
            toast.show(
                isHost
                    ? t('Partida eliminada', 'Match deleted')
                    : t('Saliste de la partida', 'You left the match'),
                'success',
            );
        } catch (error) {
            toast.show(errorMessage(error), 'error');
        }
    }

    async function pasteCode(): Promise<void> {
        const pasted = await readClipboardCode();
        if (pasted) {
            setCode(pasted);
        } else {
            toast.show(
                t(
                    'No encontramos un código en el portapapeles',
                    'No room code found in the clipboard',
                ),
                'error',
            );
        }
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
                        <span className="eyebrow">
                            {t('Tu mesa te espera', 'Your table awaits')}
                        </span>
                        <h1>
                            {t(
                                `Hola, ${user?.nickname ?? 'jugador'}`,
                                `Hi, ${user?.nickname ?? 'player'}`,
                            )}
                        </h1>
                    </div>
                </section>

                {active ? (
                    <motion.div className="resume-banner" {...cardMotion}>
                        <Icon name="card-play" size={30} style={{ color: 'var(--win)' }} />
                        <div className="resume-banner__text">
                            <strong>
                                {t('Tienes una partida en curso', 'You have a match in progress')}
                            </strong>
                            <span className="text-2">
                                {active.config.visibility === 'public'
                                    ? t('Partida rápida', 'Quick match')
                                    : t(`Sala ${active.code}`, `Room ${active.code}`)}{' '}
                                · {t(...STATUS_LABEL[active.status])} ·{' '}
                                {l(getDeckInfo(active.config.deckSources[0] ?? 'pokeapi')?.label)}
                            </span>
                        </div>
                        <div className="resume-banner__actions">
                            <Button
                                variant="emerald"
                                icon="crossed-swords"
                                onClick={() => navigate(`/match/${active.matchId}`)}
                            >
                                {t('Continuar', 'Continue')}
                            </Button>
                            <Button variant="ghost" icon="cancel" onClick={removeActive}>
                                {active.hostId === user?.id
                                    ? t('Eliminar', 'Delete')
                                    : t('Salir', 'Leave')}
                            </Button>
                        </div>
                    </motion.div>
                ) : null}

                <section className="home__actions" aria-label={t('Jugar', 'Play')}>
                    <motion.article
                        className="panel action-card action-card--quick"
                        {...cardMotion}
                    >
                        <span className="action-card__icon">
                            <Icon name="lightning-helix" />
                        </span>
                        <div className="action-card__body">
                            <h2>{t('Partida rápida', 'Quick match')}</h2>
                            <p className="text-2">
                                {t(
                                    'Elige el mazo y juega al instante contra otra persona o contra la máquina.',
                                    'Pick a deck and play right away against another person or the machine.',
                                )}
                            </p>
                            <ChoiceChips
                                label={t('Mazo', 'Deck')}
                                value={quickDeck}
                                onChange={setQuickDeck}
                                options={[
                                    { value: 'random' as const, label: t('Al azar', 'Random') },
                                    ...DECK_CATALOG.map((deck) => ({
                                        value: deck.id as DeckSourceId,
                                        label: l(deck.label),
                                    })),
                                ]}
                            />
                        </div>
                        <div className="action-card__buttons">
                            <Button
                                variant="gold"
                                icon="crossed-swords"
                                loading={quickBusy === 'rival'}
                                disabled={quickBusy !== null}
                                onClick={() => void quickMatch(false)}
                            >
                                {t('Buscar rival', 'Find a rival')}
                            </Button>
                            <Button
                                variant="ghost"
                                icon="robot-golem"
                                loading={quickBusy === 'bot'}
                                disabled={quickBusy !== null}
                                onClick={() => void quickMatch(true)}
                            >
                                {t('Contra la máquina', 'Vs the machine')}
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
                            <h2>{t('Sala privada', 'Private room')}</h2>
                            <p className="text-2">
                                {t(
                                    'Tú eliges mazo, jugadores y tiempos. Comparte el código con quien quieras.',
                                    'You choose deck, players and timing. Share the code with anyone.',
                                )}
                            </p>
                        </div>
                        {guest ? (
                            <Button variant="ghost" icon="visored-helm" onClick={goRegister}>
                                {t('Crea una cuenta', 'Create an account')}
                            </Button>
                        ) : (
                            <Button
                                variant="emerald"
                                icon="card-draw"
                                onClick={() => navigate('/create')}
                            >
                                {t('Crear sala', 'Create room')}
                            </Button>
                        )}
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
                            <h2>{t('Tengo un código', 'I have a code')}</h2>
                            <p className="text-2">
                                {t('Entra a la sala de un amigo.', "Join a friend's room.")}
                            </p>
                        </div>
                        <form
                            className="stack"
                            style={{ ['--gap' as string]: '10px' }}
                            onSubmit={joinByCode}
                        >
                            <label className="sr-only" htmlFor="join-code">
                                {t('Código de sala', 'Room code')}
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
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                icon="card-pickup"
                                onClick={pasteCode}
                            >
                                {t('Pegar código', 'Paste code')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={!CODE_PATTERN.test(code)}
                                icon="magic-portal"
                            >
                                {t('Entrar', 'Join')}
                            </Button>
                        </form>
                    </motion.article>
                </section>

                <section className="home__grid">
                    <div className="panel panel--pad stack home__panel">
                        <div className="row row--between">
                            <h3>{t('Mis salas privadas', 'My private rooms')}</h3>
                            {!guest ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="card-draw"
                                    onClick={() => navigate('/create')}
                                >
                                    {t('Nueva', 'New')}
                                </Button>
                            ) : null}
                        </div>
                        {guest ? (
                            <div className="empty-state">
                                <Icon name="hooded-figure" />
                                <p>
                                    {t(
                                        'Como invitado juegas partidas rápidas. Crea una cuenta para tener tus propias salas.',
                                        'As a guest you play quick matches. Create an account to have your own rooms.',
                                    )}
                                </p>
                            </div>
                        ) : rooms.length === 0 ? (
                            <div className="empty-state">
                                <Icon name="card-draw" />
                                <p>
                                    {t(
                                        'Aún no has creado salas. ¡Arma la primera y reta a tus amigos!',
                                        'No rooms yet. Build your first one and challenge your friends!',
                                    )}
                                </p>
                            </div>
                        ) : (
                            <ul className="room-list home__scroll">
                                {rooms.map((room) => (
                                    <li key={room.matchId} className="room-item">
                                        <span className="room-item__code">{room.code}</span>
                                        <span className="room-item__meta">
                                            <strong>
                                                {l(
                                                    getDeckInfo(
                                                        room.config.deckSources[0] ?? 'pokeapi',
                                                    )?.label,
                                                )}
                                            </strong>
                                            <span className="text-3">
                                                {room.playerCount}/{room.config.maxPlayers}{' '}
                                                {t('jugadores', 'players')} ·{' '}
                                                {t(...STATUS_LABEL[room.status])}
                                            </span>
                                        </span>
                                        {room.status !== 'FINISHED' ? (
                                            <Button
                                                size="sm"
                                                variant="gold"
                                                onClick={() => navigate(`/join/${room.code}`)}
                                            >
                                                {t('Abrir', 'Open')}
                                            </Button>
                                        ) : (
                                            <span className="badge badge--muted">
                                                {t('Cerrada', 'Closed')}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="panel panel--pad stack home__panel">
                        <h3>{t('Mejores jugadores', 'Top players')}</h3>
                        {leaders.length === 0 ? (
                            <div className="empty-state">
                                <Icon name="podium-winner" />
                                <p>
                                    {t(
                                        'El ranking se llena con las partidas terminadas.',
                                        'The ranking fills up with finished matches.',
                                    )}
                                </p>
                            </div>
                        ) : (
                            <ol className="room-list home__scroll">
                                {leaders.map((leader, index) => (
                                    <li key={leader.userId} className="leader-row">
                                        <span className="leader-row__rank">{index + 1}</span>
                                        <img src={leader.avatarUrl} alt="" width={34} height={34} />
                                        <span style={{ flex: 1 }}>{leader.nickname}</span>
                                        <span className="badge">{leader.elo}</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
