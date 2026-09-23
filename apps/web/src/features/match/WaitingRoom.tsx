import type { RedactedMatchState } from '@kardux/contracts';
import { getDeckInfo } from '@kardux/content';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
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

export function WaitingRoom({
    state,
    onStart,
    onCancelCountdown,
    onLeave,
}: WaitingRoomProps): JSX.Element {
    const toast = useToast();
    const now = useNow(200, state.phase === 'COUNTDOWN');
    const isHost = state.hostId === state.yourId;
    const seated = state.players.filter((player) => !player.isSpectator);
    const emptySeats = Math.max(0, state.config.maxPlayers - seated.length);
    const deck = getDeckInfo(state.config.deckSources[0] ?? 'pokeapi');
    const isQuick = state.config.visibility === 'public';
    const canStart = seated.length >= state.config.minPlayers;
    const countdown =
        state.phase === 'COUNTDOWN' && state.countdownEndsAt
            ? Math.max(0, Math.ceil((state.countdownEndsAt - now) / 1000))
            : null;

    async function copy(text: string, label: string): Promise<void> {
        toast.show(
            (await copyToClipboard(text)) ? `${label} copiado` : 'No se pudo copiar',
            'success',
        );
    }

    return (
        <div className="waiting">
            <section className="panel panel--pad waiting__invite">
                <span className="eyebrow">{isQuick ? 'Partida rápida' : 'Sala privada'}</span>
                {isQuick ? (
                    <>
                        <h1>Buscando rival…</h1>
                        <p className="text-2">
                            La partida arranca sola en cuanto se siente otro jugador.
                        </p>
                        <div className="waiting__radar" aria-hidden>
                            <span />
                            <span />
                            <Icon name="crossed-swords" />
                        </div>
                    </>
                ) : (
                    <>
                        <h1>Invita a tus rivales</h1>
                        <button
                            type="button"
                            className="waiting__code"
                            onClick={() => copy(state.code, 'Código')}
                            aria-label={`Código ${state.code}, toca para copiar`}
                        >
                            {state.code}
                        </button>
                        <p className="text-3">Toca el código para copiarlo o comparte el enlace.</p>
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
                                <Icon name="envelope" className="btn__icon" /> Correo
                            </a>
                            <Button
                                size="sm"
                                icon="linked-rings"
                                onClick={() => copy(inviteUrl(state.code), 'Enlace')}
                            >
                                Copiar enlace
                            </Button>
                            {canNativeShare() ? (
                                <Button
                                    size="sm"
                                    icon="share"
                                    onClick={() => void nativeShare(state.code)}
                                >
                                    Compartir
                                </Button>
                            ) : null}
                        </div>
                    </>
                )}

                <div className="config-summary" style={{ justifyContent: 'center' }}>
                    {deck ? (
                        <span className="badge">
                            <Icon name={deck.coverIcon} /> {deck.label}
                        </span>
                    ) : null}
                    <span className="badge badge--muted">
                        {state.config.packs * state.config.cardsPerPack} cartas
                    </span>
                    <span className="badge badge--muted">
                        {formatDuration(state.config.matchDurationMs)}
                    </span>
                    <span className="badge badge--muted">
                        Inicio automático con {state.config.autoStartPlayers}
                    </span>
                </div>
            </section>

            <section className="panel panel--pad waiting__seats" aria-label="Jugadores">
                <div className="row row--between">
                    <h2>Jugadores</h2>
                    <span className="badge tabular">
                        {seated.length}/{state.config.maxPlayers}
                    </span>
                </div>
                <ul className="seat-grid">
                    <AnimatePresence initial={false}>
                        {seated.map((player) => (
                            <motion.li
                                key={player.id}
                                className={`seat-slot ${player.id === state.yourId ? 'is-you' : ''}`}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
                            >
                                <Avatar seed={player.avatarSeed} size={58} />
                                <strong className="seat-slot__name">{player.nickname}</strong>
                                <span className="text-3 seat-slot__role">
                                    {player.id === state.hostId
                                        ? 'Anfitrión'
                                        : player.id === state.yourId
                                          ? 'Tú'
                                          : 'Listo'}
                                </span>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                    {Array.from({ length: Math.min(emptySeats, 6) }, (_, index) => (
                        <li key={`empty-${index}`} className="seat-slot seat-slot--empty">
                            <span className="seat-slot__placeholder">
                                <Icon name="hooded-figure" />
                            </span>
                            <span className="text-3">Libre</span>
                        </li>
                    ))}
                </ul>

                <AnimatePresence>
                    {countdown !== null ? (
                        <motion.div
                            className="countdown"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                        >
                            <span className="countdown__label">La partida empieza en</span>
                            <motion.span
                                key={countdown}
                                className="countdown__value"
                                initial={{ scale: 1.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', bounce: 0.4, duration: 0.5 }}
                            >
                                {countdown}
                            </motion.span>
                            {isHost ? (
                                <Button size="sm" variant="ghost" onClick={onCancelCountdown}>
                                    Cancelar
                                </Button>
                            ) : null}
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                <div className="waiting__actions">
                    {isHost && state.phase === 'LOBBY' ? (
                        <Button
                            variant="gold"
                            size="lg"
                            block
                            icon="crossed-swords"
                            disabled={!canStart}
                            onClick={onStart}
                        >
                            {canStart
                                ? 'Iniciar partida'
                                : `Faltan ${state.config.minPlayers - seated.length} jugador(es)`}
                        </Button>
                    ) : state.phase === 'LOBBY' ? (
                        <p className="text-2" style={{ textAlign: 'center' }}>
                            Esperando a que el anfitrión inicie la partida…
                        </p>
                    ) : null}
                    <Button variant="ghost" block icon="exit-door" onClick={onLeave}>
                        Salir de la sala
                    </Button>
                </div>
            </section>
        </div>
    );
}
