import type { LeaderboardEntry, MatchSummary, MatchSummaryWithRole } from '@kardux/contracts';
import { getDeckInfo } from '@kardux/content';
import { motion } from 'framer-motion';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useNow';
import { deleteMatch, getActiveMatch, getLeaderboard, listMyMatches } from '../../lib/api';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { clearSession, getUser, isGuest } from '../../lib/session';
import { extractRoomCode, readClipboardCode } from '../../lib/share';
import { disconnectGameSocket, whenConnected } from '../../lib/socket';

const CODE_PATTERN = /^[0-9A-F]{6}$/;

const STATUS_LABEL: Record<MatchSummary['status'], string> = {
    LOBBY: 'En sala',
    IN_PROGRESS: 'Jugando',
    FINISHED: 'Terminada',
};

const cardMotion = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
};

export default function HomePage(): JSX.Element {
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
    const [quickBusy, setQuickBusy] = useState(false);

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

    async function quickMatch(): Promise<void> {
        setQuickBusy(true);
        try {
            const socket = await whenConnected();
            const ack = await socket.timeout(10_000).emitWithAck('match:quick', {});
            if (isErrorPayload(ack)) throw ack;
            navigate(`/match/${ack.matchId}`);
        } catch (error) {
            toast.show(errorMessage(error), 'error');
        } finally {
            setQuickBusy(false);
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
            toast.show(isHost ? 'Partida eliminada' : 'Saliste de la partida', 'success');
        } catch (error) {
            toast.show(errorMessage(error), 'error');
        }
    }

    async function pasteCode(): Promise<void> {
        const pasted = await readClipboardCode();
        if (pasted) {
            setCode(pasted);
        } else {
            toast.show('No encontramos un código en el portapapeles', 'error');
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
                        <span className="eyebrow">Tu mesa te espera</span>
                        <h1>Hola, {user?.nickname ?? 'jugador'}</h1>
                    </div>
                </section>

                {active ? (
                    <motion.div className="resume-banner" {...cardMotion}>
                        <Icon name="card-play" size={30} style={{ color: 'var(--win)' }} />
                        <div className="resume-banner__text">
                            <strong>Tienes una partida en curso</strong>
                            <span className="text-2">
                                {active.config.visibility === 'public'
                                    ? 'Partida rápida'
                                    : `Sala ${active.code}`}{' '}
                                · {STATUS_LABEL[active.status]} ·{' '}
                                {getDeckInfo(active.config.deckSources[0] ?? 'pokeapi')?.label}
                            </span>
                        </div>
                        <div className="resume-banner__actions">
                            <Button
                                variant="emerald"
                                icon="crossed-swords"
                                onClick={() => navigate(`/match/${active.matchId}`)}
                            >
                                Continuar
                            </Button>
                            <Button variant="ghost" icon="cancel" onClick={removeActive}>
                                {active.hostId === user?.id ? 'Eliminar' : 'Salir'}
                            </Button>
                        </div>
                    </motion.div>
                ) : null}

                <section className="home__actions" aria-label="Jugar">
                    <motion.article
                        className="panel action-card action-card--quick"
                        {...cardMotion}
                    >
                        <span className="action-card__icon">
                            <Icon name="lightning-helix" />
                        </span>
                        <div className="action-card__body">
                            <h2>Partida rápida</h2>
                            <p className="text-2">
                                Te emparejamos con otro jugador al instante. Sin esperas, sin
                                aprobaciones: arranca apenas haya rival.
                            </p>
                        </div>
                        <Button
                            variant="gold"
                            size="lg"
                            icon="crossed-swords"
                            loading={quickBusy}
                            onClick={quickMatch}
                        >
                            Buscar rival
                        </Button>
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
                            <h2>Sala privada</h2>
                            <p className="text-2">
                                Tú eliges mazo, jugadores y tiempos. Comparte el código con quien
                                quieras.
                            </p>
                        </div>
                        {guest ? (
                            <Button variant="ghost" icon="visored-helm" onClick={goRegister}>
                                Crea una cuenta
                            </Button>
                        ) : (
                            <Button
                                variant="emerald"
                                icon="card-draw"
                                onClick={() => navigate('/create')}
                            >
                                Crear sala
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
                            <h2>Tengo un código</h2>
                            <p className="text-2">Entra a la sala de un amigo.</p>
                        </div>
                        <form
                            className="stack"
                            style={{ ['--gap' as string]: '10px' }}
                            onSubmit={joinByCode}
                        >
                            <label className="sr-only" htmlFor="join-code">
                                Código de sala
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
                                Pegar código
                            </Button>
                            <Button
                                type="submit"
                                disabled={!CODE_PATTERN.test(code)}
                                icon="magic-portal"
                            >
                                Entrar
                            </Button>
                        </form>
                    </motion.article>
                </section>

                <section className="home__grid">
                    <div className="panel panel--pad stack">
                        <div className="row row--between">
                            <h3>Mis salas privadas</h3>
                            {!guest ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="card-draw"
                                    onClick={() => navigate('/create')}
                                >
                                    Nueva
                                </Button>
                            ) : null}
                        </div>
                        {guest ? (
                            <div className="empty-state">
                                <Icon name="hooded-figure" />
                                <p>
                                    Como invitado juegas partidas rápidas. Crea una cuenta para
                                    tener tus propias salas.
                                </p>
                            </div>
                        ) : rooms.length === 0 ? (
                            <div className="empty-state">
                                <Icon name="card-draw" />
                                <p>
                                    Aún no has creado salas. ¡Arma la primera y reta a tus amigos!
                                </p>
                            </div>
                        ) : (
                            <ul className="room-list">
                                {rooms.map((room) => (
                                    <li key={room.matchId} className="room-item">
                                        <span className="room-item__code">{room.code}</span>
                                        <span className="room-item__meta">
                                            <strong>
                                                {
                                                    getDeckInfo(
                                                        room.config.deckSources[0] ?? 'pokeapi',
                                                    )?.label
                                                }
                                            </strong>
                                            <span className="text-3">
                                                {room.playerCount}/{room.config.maxPlayers}{' '}
                                                jugadores · {STATUS_LABEL[room.status]}
                                            </span>
                                        </span>
                                        {room.status !== 'FINISHED' ? (
                                            <Button
                                                size="sm"
                                                variant="gold"
                                                onClick={() => navigate(`/join/${room.code}`)}
                                            >
                                                Abrir
                                            </Button>
                                        ) : (
                                            <span className="badge badge--muted">Cerrada</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="panel panel--pad stack">
                        <h3>Mejores jugadores</h3>
                        {leaders.length === 0 ? (
                            <div className="empty-state">
                                <Icon name="podium-winner" />
                                <p>El ranking se llena con las partidas terminadas.</p>
                            </div>
                        ) : (
                            <ol className="room-list">
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
