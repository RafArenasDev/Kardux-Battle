import type { CreateMatchRequest, DeckSourceDescriptor } from '@kardux/contracts';
import { MAX_PLAYERS } from '@kardux/contracts';
import { POKEMON_DECK, validateDeckConfig } from '@kardux/content';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useLocale } from '../../lib/i18n';
import { tryEnterFullscreen } from '../../lib/matchFullscreen';
import { getUser, isGuest } from '../../lib/session';
import { whenConnected } from '../../lib/socket';

/** The Pokémon base stats explained in the attribute list. */
type AttributeKey = 'hp' | 'attack' | 'defense' | 'speed' | 'special-attack' | 'special-defense';

const DURATIONS = [10, 20, 30, 60, 0].map((minutes) => minutes * 60_000);
const TURN_TIMEOUTS = [15, 30, 60, 0].map((seconds) => seconds * 1_000);

export default function CreateMatchPage(): JSX.Element {
    const { t } = useTranslation();
    const { l } = useLocale();
    useDocumentTitle('');
    const navigate = useNavigate();
    const toast = useToast();

    const [deck, setDeck] = useState<DeckSourceDescriptor | null>(null);
    const [minPlayers, setMinPlayers] = useState(2);
    const [maxPlayers, setMaxPlayers] = useState(MAX_PLAYERS);
    const [autoStartPlayers, setAutoStartPlayers] = useState(MAX_PLAYERS);
    const [packs, setPacks] = useState(4);
    const [cardsPerPack, setCardsPerPack] = useState(8);
    const [attributeCount, setAttributeCount] = useState(4);
    const [cardsPerPlayer, setCardsPerPlayer] = useState(0);
    const [matchDurationMs, setMatchDurationMs] = useState(60 * 60_000);
    const [turnTimeoutMs, setTurnTimeoutMs] = useState(30_000);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        listDeckSources()
            .then((sources) => setDeck(sources.find((source) => source.id === 'pokeapi') ?? null))
            .catch((error: unknown) => toast.show(errorMessage(error), 'error'));
    }, [toast]);

    const maxPacks = deck?.maxPacks ?? POKEMON_DECK.maxPacks;
    const maxFamilies = deck?.maxCardsPerPack ?? POKEMON_DECK.maxCardsPerPack;
    const maxAttributes = POKEMON_DECK.attributes.length;

    useEffect(() => {
        setMinPlayers((value) => Math.min(value, maxPlayers));
        setAutoStartPlayers((value) => Math.max(minPlayers, Math.min(value, maxPlayers)));
    }, [minPlayers, maxPlayers]);

    const totalCards = packs * cardsPerPack;
    const evenShare = Math.floor(totalCards / maxPlayers);
    const perPlayer = cardsPerPlayer > 0 ? Math.min(cardsPerPlayer, evenShare) : evenShare;
    const maxCardsPerPlayer = Math.max(1, Math.floor(totalCards / minPlayers));
    const leftover = totalCards - perPlayer * maxPlayers;
    const config: CreateMatchRequest = {
        deckSources: ['pokeapi'],
        mixSources: false,
        minPlayers,
        maxPlayers,
        autoStartPlayers,
        packs,
        cardsPerPack,
        attributeCount,
        cardsPerPlayer,
        matchDurationMs,
        turnTimeoutMs,
        onTurnTimeout: 'random_attr',
        visibility: 'private',
    };

    const problem = useMemo(
        () =>
            validateDeckConfig({
                deckSources: ['pokeapi'],
                packs,
                cardsPerPack,
                attributeCount,
                maxPlayers,
            }),
        [packs, cardsPerPack, attributeCount, maxPlayers],
    );

    if (isGuest()) return <Navigate to="/home" replace />;

    async function submit(): Promise<void> {
        const user = getUser();
        if (!user || problem) return;
        // Synchronous, before any `await` below - see matchFullscreen.ts's own comment.
        tryEnterFullscreen();
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
            toast.show(t('create.created', { code: match.code }), 'success');
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
                        <span className="eyebrow">{t('home.private.title')}</span>
                        <h1>{t('create.title')}</h1>
                    </div>
                    <Button variant="ghost" icon="return-arrow" onClick={() => navigate('/home')}>
                        {t('common.back')}
                    </Button>
                </div>

                <div className="create__layout">
                    <section className="panel panel--pad create__deck" aria-labelledby="deck-title">
                        <h2 id="deck-title">{t('create.deck')}</h2>
                        <div
                            className="deck-hero"
                            style={{ ['--accent' as string]: POKEMON_DECK.accent }}
                        >
                            <div className="deck-hero__fan" aria-hidden>
                                {(deck?.preview ?? []).slice(0, 3).map((card, index) => (
                                    <img
                                        key={card.imageUrl}
                                        src={card.imageUrl}
                                        alt=""
                                        loading="lazy"
                                        style={{
                                            transform: `translateX(-50%) rotate(${(index - 1) * 12}deg)`,
                                            zIndex: index === 1 ? 2 : 1,
                                        }}
                                    />
                                ))}
                                {!deck ? <span className="spinner" /> : null}
                            </div>
                            <div className="deck-hero__text">
                                <h3>
                                    <Icon name={POKEMON_DECK.coverIcon} /> {l(POKEMON_DECK.label)}
                                </h3>
                                <p className="text-2">{l(POKEMON_DECK.description)}</p>
                                <div className="config-summary">
                                    <span className="badge">
                                        {deck?.ready
                                            ? t('create.pool', { count: deck.cardCount })
                                            : t('create.syncing')}
                                    </span>
                                    <span className="badge badge--muted">
                                        {t('create.attributesAvailable', { count: maxAttributes })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <dl className="create__facts">
                            <div>
                                <dt>{t('create.facts.total')}</dt>
                                <dd className="tabular">{totalCards}</dd>
                            </div>
                            <div>
                                <dt>{t('create.facts.perPlayer', { count: maxPlayers })}</dt>
                                <dd className="tabular">{perPlayer}</dd>
                            </div>
                            <div>
                                <dt>{t('create.facts.leftover')}</dt>
                                <dd className="tabular">{leftover}</dd>
                            </div>
                            <div>
                                <dt>{t('create.facts.duration')}</dt>
                                <dd>{formatDuration(matchDurationMs)}</dd>
                            </div>
                        </dl>
                        <div className="attr-list">
                            <div className="row row--between">
                                <h3>{t('create.attrTitle')}</h3>
                                <span className="badge">
                                    {t('create.attrInPlay', {
                                        count: attributeCount,
                                        total: maxAttributes,
                                    })}
                                </span>
                            </div>
                            <p className="text-3">{t('create.attrIntro')}</p>
                            <ul>
                                {POKEMON_DECK.attributes.map((attribute, index) => {
                                    const inPlay = index < attributeCount;
                                    return (
                                        <li
                                            key={attribute.key}
                                            className={`attr-list__item ${inPlay ? 'is-on' : ''}`}
                                        >
                                            <span className="attr-list__icon">
                                                <Icon name={attribute.icon} />
                                            </span>
                                            <span className="attr-list__text">
                                                <strong>{l(attribute.label)}</strong>
                                                <span className="text-3">
                                                    {t(
                                                        `create.attr.${attribute.key as AttributeKey}`,
                                                    )}
                                                </span>
                                            </span>
                                            <span className="attr-list__state">
                                                {inPlay ? t('create.attrOn') : t('create.attrOff')}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        <p className="text-3 create__credit">{l(POKEMON_DECK.credits)}</p>
                    </section>

                    <section
                        className="panel panel--pad create__rules"
                        aria-labelledby="rules-title"
                    >
                        <h2 id="rules-title">{t('create.rules')}</h2>

                        <div className="config-grid">
                            <ConfigRow label={t('create.maxPlayers')}>
                                <Stepper
                                    label={t('create.maxPlayers')}
                                    value={maxPlayers}
                                    min={2}
                                    max={MAX_PLAYERS}
                                    onChange={setMaxPlayers}
                                />
                            </ConfigRow>
                            <ConfigRow
                                label={t('create.minPlayers')}
                                hint={t('create.minPlayersHint')}
                            >
                                <Stepper
                                    label={t('create.minPlayers')}
                                    value={minPlayers}
                                    min={2}
                                    max={maxPlayers}
                                    onChange={setMinPlayers}
                                />
                            </ConfigRow>
                            <ConfigRow
                                label={t('create.autoStart')}
                                hint={t('create.autoStartHint')}
                            >
                                <Stepper
                                    label={t('create.autoStart')}
                                    value={autoStartPlayers}
                                    min={minPlayers}
                                    max={maxPlayers}
                                    onChange={setAutoStartPlayers}
                                />
                            </ConfigRow>
                            <ConfigRow label={t('create.attributes')}>
                                <Stepper
                                    label={t('create.attributes')}
                                    value={attributeCount}
                                    min={3}
                                    max={maxAttributes}
                                    onChange={setAttributeCount}
                                />
                            </ConfigRow>
                            <ConfigRow label={t('create.packs')} hint={t('create.packsHint')}>
                                <Stepper
                                    label={t('create.packs')}
                                    value={packs}
                                    min={1}
                                    max={maxPacks}
                                    onChange={setPacks}
                                />
                            </ConfigRow>
                            <ConfigRow label={t('create.families')} hint={t('create.familiesHint')}>
                                <Stepper
                                    label={t('create.families')}
                                    value={cardsPerPack}
                                    min={2}
                                    max={maxFamilies}
                                    onChange={setCardsPerPack}
                                />
                            </ConfigRow>
                            <ConfigRow
                                label={t('create.cardsPerPlayer')}
                                hint={t('create.cardsPerPlayerHint')}
                                wide
                            >
                                <Stepper
                                    label={t('create.cardsPerPlayer')}
                                    value={Math.min(cardsPerPlayer, maxCardsPerPlayer)}
                                    min={0}
                                    max={maxCardsPerPlayer}
                                    onChange={setCardsPerPlayer}
                                    format={(value) =>
                                        value === 0 ? t('create.allCards') : String(value)
                                    }
                                />
                            </ConfigRow>
                            <ConfigRow label={t('create.duration')} wide>
                                <ChoiceChips
                                    label={t('create.duration')}
                                    value={matchDurationMs}
                                    options={DURATIONS.map((value) => ({
                                        value,
                                        label: formatDuration(value),
                                    }))}
                                    onChange={setMatchDurationMs}
                                />
                            </ConfigRow>
                            <ConfigRow label={t('create.turnTime')} wide>
                                <ChoiceChips
                                    label={t('create.turnTime')}
                                    value={turnTimeoutMs}
                                    options={TURN_TIMEOUTS.map((value) => ({
                                        value,
                                        label:
                                            value === 0
                                                ? t('create.free')
                                                : t('format.seconds', { count: value / 1000 }),
                                    }))}
                                    onChange={setTurnTimeoutMs}
                                />
                            </ConfigRow>
                        </div>

                        {problem ? <p className="form-error">{l(problem)}</p> : null}

                        <Button
                            variant="gold"
                            size="lg"
                            block
                            icon="crossed-swords"
                            loading={busy}
                            disabled={Boolean(problem) || !deck?.ready}
                            onClick={submit}
                        >
                            {t('home.private.create')}
                        </Button>
                    </section>
                </div>
            </div>
        </AppShell>
    );
}

function ConfigRow({
    label,
    hint,
    wide = false,
    children,
}: {
    label: string;
    hint?: string;
    wide?: boolean;
    children: JSX.Element;
}): JSX.Element {
    return (
        <div className={`config-row ${wide ? 'config-row--wide' : ''}`}>
            <span className="config-row__label">
                {label}
                {hint ? <span className="text-3">{hint}</span> : null}
            </span>
            {children}
        </div>
    );
}
