import type { CreateMatchRequest, DeckSourceDescriptor, DeckSourceId } from '@kardux/contracts';
import { getDeckInfo, validateDeckConfig } from '@kardux/content';
import { motion } from 'framer-motion';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { ChoiceChips, Stepper } from '../../components/ui/Segmented';
import { useToast } from '../../components/ui/Toast';
import { useDocumentTitle } from '../../hooks/useNow';
import { createMatch, listDeckSources } from '../../lib/api';
import { errorMessage, isErrorPayload } from '../../lib/errors';
import { formatDuration } from '../../lib/format';
import { getUser, isGuest } from '../../lib/session';
import { whenConnected } from '../../lib/socket';
import { useI18n } from '../../lib/i18n';

const DURATIONS = [10, 20, 30, 60, 0].map((minutes) => ({
    value: minutes * 60_000,
    label: minutes === 0 ? 'Sin límite' : `${minutes} min`,
}));

const TURN_TIMEOUTS = [15, 30, 60, 0].map((seconds) => ({
    value: seconds * 1_000,
    label: seconds === 0 ? 'Libre' : `${seconds} s`,
}));

export default function CreateMatchPage(): JSX.Element {
    const { l } = useI18n();
    useDocumentTitle('');
    const navigate = useNavigate();
    const toast = useToast();

    const [decks, setDecks] = useState<DeckSourceDescriptor[]>([]);
    const [deckId, setDeckId] = useState<DeckSourceId>('pokeapi');
    const [minPlayers, setMinPlayers] = useState(2);
    const [maxPlayers, setMaxPlayers] = useState(7);
    const [autoStartPlayers, setAutoStartPlayers] = useState(7);
    const [packs, setPacks] = useState(4);
    const [cardsPerPack, setCardsPerPack] = useState(8);
    const [attributeCount, setAttributeCount] = useState(4);
    const [matchDurationMs, setMatchDurationMs] = useState(60 * 60_000);
    const [turnTimeoutMs, setTurnTimeoutMs] = useState(30_000);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        listDeckSources()
            .then(setDecks)
            .catch((error: unknown) => toast.show(errorMessage(error), 'error'));
    }, [toast]);

    const info = getDeckInfo(deckId);
    const selected = decks.find((deck) => deck.id === deckId);
    const limits = {
        maxPacks: selected?.maxPacks ?? info?.limits.maxPacks ?? 4,
        maxCardsPerPack: Math.min(
            26,
            selected?.maxCardsPerPack ?? info?.limits.maxCardsPerPack ?? 8,
        ),
        maxAttributes: Math.min(6, info?.attributes.length ?? 4),
    };

    // Keep every value inside what the chosen deck (and the rules) allow.
    useEffect(() => {
        setPacks((value) => Math.min(value, limits.maxPacks));
        setCardsPerPack((value) => Math.min(value, limits.maxCardsPerPack));
        setAttributeCount((value) => Math.max(3, Math.min(value, limits.maxAttributes)));
    }, [limits.maxPacks, limits.maxCardsPerPack, limits.maxAttributes]);

    useEffect(() => {
        setMinPlayers((value) => Math.min(value, maxPlayers));
        setAutoStartPlayers((value) => Math.max(minPlayers, Math.min(value, maxPlayers)));
    }, [minPlayers, maxPlayers]);

    const totalCards = packs * cardsPerPack;
    const config: CreateMatchRequest = {
        deckSources: [deckId],
        mixSources: false,
        minPlayers,
        maxPlayers,
        autoStartPlayers,
        packs,
        cardsPerPack,
        attributeCount,
        matchDurationMs,
        turnTimeoutMs,
        onTurnTimeout: 'random_attr',
        visibility: 'private',
    };

    const problem = useMemo(() => {
        if (totalCards < maxPlayers) {
            return `El mazo (${totalCards} cartas) es muy pequeño para ${maxPlayers} jugadores.`;
        }
        return validateDeckConfig({
            deckSources: [deckId],
            packs,
            cardsPerPack,
            attributeCount,
            maxPlayers,
        });
    }, [totalCards, maxPlayers, deckId, packs, cardsPerPack, attributeCount]);

    if (isGuest()) return <Navigate to="/home" replace />;

    async function submit(): Promise<void> {
        const user = getUser();
        if (!user || problem) return;
        setBusy(true);
        try {
            const match = await createMatch(config);
            const socket = await whenConnected();
            const ack = await socket.timeout(10_000).emitWithAck('match:join', {
                code: match.code,
                nickname: user.nickname,
                avatarSeed: user.avatarSeed,
            });
            if (isErrorPayload(ack)) throw ack;
            toast.show(`Sala ${match.code} creada`, 'success');
            navigate(`/match/${ack.matchId}`, { replace: true });
        } catch (error) {
            toast.show(errorMessage(error), 'error');
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <div className="create">
                <div className="row row--between row--wrap">
                    <div className="stack" style={{ ['--gap' as string]: '4px' }}>
                        <span className="eyebrow">Sala privada</span>
                        <h1>Arma tu mesa</h1>
                    </div>
                    <Button variant="ghost" icon="return-arrow" onClick={() => navigate('/home')}>
                        Volver
                    </Button>
                </div>

                <div className="create__layout">
                    <section className="panel panel--pad stack" aria-labelledby="deck-title">
                        <h2 id="deck-title">Elige el mazo</h2>
                        <div className="deck-grid" role="radiogroup" aria-label="Mazo">
                            {(decks.length > 0 ? decks : []).map((deck) => {
                                const deckInfo = getDeckInfo(deck.id);
                                const checked = deck.id === deckId;
                                return (
                                    <motion.button
                                        key={deck.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={checked}
                                        aria-disabled={!deck.ready}
                                        className="deck-tile"
                                        style={{ ['--accent' as string]: deck.accent }}
                                        onClick={() => deck.ready && setDeckId(deck.id)}
                                        whileHover={{ y: -3 }}
                                    >
                                        <div className="deck-tile__fan" aria-hidden>
                                            {deck.preview.slice(0, 3).map((card, index) => (
                                                <img
                                                    key={card.name}
                                                    src={card.imageUrl}
                                                    alt=""
                                                    loading="lazy"
                                                    style={{
                                                        transform: `translateX(-50%) rotate(${(index - 1) * 12}deg)`,
                                                        zIndex: index === 1 ? 2 : 1,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <div className="deck-tile__head">
                                            {deckInfo ? <Icon name={deckInfo.coverIcon} /> : null}
                                            <h3>{l(deck.label)}</h3>
                                        </div>
                                        <span className="deck-tile__desc">{l(deck.tagline)}</span>
                                        <span className="badge badge--muted">
                                            {deck.ready
                                                ? `${deck.cardCount} cartas`
                                                : 'Descargando…'}
                                        </span>
                                    </motion.button>
                                );
                            })}
                            {decks.length === 0 ? (
                                <div className="empty-state">
                                    <span className="spinner" />
                                </div>
                            ) : null}
                        </div>
                        {info?.credits ? (
                            <p className="text-3" style={{ fontSize: '0.8rem' }}>
                                {l(info.credits)}
                            </p>
                        ) : null}
                    </section>

                    <section className="panel panel--pad config-grid" aria-labelledby="rules-title">
                        <h2 id="rules-title">Reglas</h2>

                        <div className="config-row">
                            <span className="config-row__label">Jugadores máximos</span>
                            <Stepper
                                label="jugadores máximos"
                                value={maxPlayers}
                                min={2}
                                max={12}
                                onChange={setMaxPlayers}
                            />
                        </div>
                        <div className="config-row">
                            <span className="config-row__label">
                                Mínimo para iniciar{' '}
                                <span className="text-3">el anfitrión da inicio</span>
                            </span>
                            <Stepper
                                label="mínimo de jugadores"
                                value={minPlayers}
                                min={2}
                                max={maxPlayers}
                                onChange={setMinPlayers}
                            />
                        </div>
                        <div className="config-row">
                            <span className="config-row__label">
                                Inicio automático <span className="text-3">al llegar a</span>
                            </span>
                            <Stepper
                                label="jugadores para inicio automático"
                                value={autoStartPlayers}
                                min={minPlayers}
                                max={maxPlayers}
                                onChange={setAutoStartPlayers}
                                format={(value) => `${value} jugadores`}
                            />
                        </div>
                        <div className="config-row">
                            <span className="config-row__label">
                                Paquetes <span className="text-3">cartas por familia</span>
                            </span>
                            <Stepper
                                label="paquetes"
                                value={packs}
                                min={1}
                                max={limits.maxPacks}
                                onChange={setPacks}
                            />
                        </div>
                        <div className="config-row">
                            <span className="config-row__label">
                                Familias <span className="text-3">cuartetos en juego</span>
                            </span>
                            <Stepper
                                label="familias"
                                value={cardsPerPack}
                                min={2}
                                max={limits.maxCardsPerPack}
                                onChange={setCardsPerPack}
                            />
                        </div>
                        <div className="config-row">
                            <span className="config-row__label">Atributos por carta</span>
                            <Stepper
                                label="atributos"
                                value={attributeCount}
                                min={3}
                                max={limits.maxAttributes}
                                onChange={setAttributeCount}
                            />
                        </div>
                        <div className="config-row">
                            <span className="config-row__label">Duración</span>
                            <ChoiceChips
                                label="Duración"
                                value={matchDurationMs}
                                options={DURATIONS}
                                onChange={setMatchDurationMs}
                            />
                        </div>
                        <div className="config-row">
                            <span className="config-row__label">Tiempo por turno</span>
                            <ChoiceChips
                                label="Tiempo por turno"
                                value={turnTimeoutMs}
                                options={TURN_TIMEOUTS}
                                onChange={setTurnTimeoutMs}
                            />
                        </div>

                        <div className="config-summary">
                            <span className="badge">{totalCards} cartas</span>
                            <span className="badge badge--muted">
                                {formatDuration(matchDurationMs)}
                            </span>
                        </div>

                        {problem ? <p className="form-error">{l(problem)}</p> : null}

                        <Button
                            variant="gold"
                            size="lg"
                            block
                            icon="crossed-swords"
                            loading={busy}
                            disabled={Boolean(problem) || !selected?.ready}
                            onClick={submit}
                        >
                            Crear sala
                        </Button>
                    </section>
                </div>
            </div>
        </AppShell>
    );
}
