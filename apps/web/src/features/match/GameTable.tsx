import type { Card, Player, RedactedMatchState } from '@kardux/contracts';
import { TABLE_TIMING } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX, RefObject } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CardBack, PlayingCard } from '../../components/cards/PlayingCard';
import type { CardOutcome } from '../../components/cards/PlayingCard';
import { Avatar } from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import type { Breakpoint } from '../../hooks/useBreakpoint';
import { useNow } from '../../hooks/useNow';
import { attributeMeta, formatStat } from '../../lib/deck-meta';
import { useLocale } from '../../lib/i18n';
import type { FrozenCounts, RevealState } from './useMatchSession';

interface GameTableProps {
    state: RedactedMatchState;
    reveal: RevealState | null;
    frozen: FrozenCounts | null;
    dealing: boolean;
    myPlayedCard: Card | null;
    breakpoint: Breakpoint;
    onSelectAttribute: (attribute: string) => void;
}

/** Cards travel like real cards: a soft spring, never a snap. */
const cardTravel = { type: 'spring', stiffness: 170, damping: 24, mass: 0.9 } as const;
/** Deal pacing: the whole deal fits inside `TABLE_TIMING.dealMs`, with room for the shuffle. */
const SHUFFLE_MS = 1_100;
const DEAL_WINDOW_MS = TABLE_TIMING.dealMs - SHUFFLE_MS - 700;
/** Cards flying at once during the deal are capped; each flight may carry several cards. */
const MAX_DEAL_FLIGHTS = 48;

function currentLeaderId(state: RedactedMatchState): string | null {
    if (state.phase === 'AWAITING_ATTRIBUTE')
        return state.turnOrder[state.currentTurnIndex] ?? null;
    return state.round?.leaderId ?? null;
}

/** Live size of an element (content box), updated on every resize. */
function useElementSize<T extends HTMLElement>(): [
    RefObject<T>,
    { width: number; height: number },
] {
    const ref = useRef<T>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const { width, height } = entry.contentRect;
            setSize((current) =>
                Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
                    ? current
                    : { width, height },
            );
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, size];
}

/** Space below each card on the table (owner + value pill) and between cards. */
const SLOT_LABEL_PX = 30;
const SLOT_GAP_PX = 12;

/**
 * The biggest card size that fits `count` cards in a `width` x `height` box: tries every number
 * of columns and keeps the one that gives the widest card (height is always 1.4 x width).
 * On a phone a duel becomes one card above the other; on a wide screen, one row.
 */
function fitCards(
    count: number,
    width: number,
    height: number,
    maxWidth: number,
): { columns: number; cardWidth: number } {
    let best = { columns: Math.max(1, count), cardWidth: 0 };
    for (let columns = 1; columns <= Math.max(1, count); columns++) {
        const rows = Math.ceil(count / columns);
        const byWidth = (width - (columns - 1) * SLOT_GAP_PX) / columns;
        const byHeight = (height - rows * SLOT_LABEL_PX - (rows - 1) * SLOT_GAP_PX) / rows / 1.4;
        const cardWidth = Math.floor(Math.min(maxWidth, byWidth, byHeight));
        if (cardWidth > best.cardWidth) best = { columns, cardWidth };
    }
    return best;
}

/** Center of `target` relative to the table's top-left corner. */
function centerIn(table: HTMLElement, target: Element): { x: number; y: number } {
    const box = table.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top };
}

export function GameTable({
    state,
    reveal,
    frozen,
    dealing,
    myPlayedCard,
    breakpoint,
    onSelectAttribute,
}: GameTableProps): JSX.Element {
    const tableRef = useRef<HTMLDivElement>(null);
    const seated = useMemo(
        () => state.players.filter((player) => !player.isSpectator || player.isEliminated),
        [state.players],
    );
    const me = state.players.find((player) => player.id === state.yourId);
    const opponents = seated.filter((player) => player.id !== state.yourId);
    const leaderId = currentLeaderId(state);
    const deal = useDealCounts(state, dealing);

    /** What each pile shows right now: the deal in progress, the pre-reveal counts, or the
     *  live counts minus a card already laid on the table. */
    const countOf = (player: Player): number => {
        if (deal.counts) return deal.counts[player.id] ?? 0;
        if (frozen) return frozen.cards[player.id] ?? player.cardCount;
        const onTable = state.round?.playedBy.includes(player.id) ? 1 : 0;
        return Math.max(0, player.cardCount - onTable);
    };
    const potSize = frozen ? frozen.pot : state.potSize;
    const deckSize = deal.counts ? deal.deckLeft : state.undealtCount;
    const compact = breakpoint === 'mobile';
    const hand = useHand(state, {
        busy: reveal !== null || deal.counts !== null,
        isLeader: leaderId === state.yourId,
        myPlayedCard,
    });
    const handCard = <HandCard hand={hand} onSelectAttribute={onSelectAttribute} />;

    return (
        <div className={`table table--${breakpoint}`} ref={tableRef}>
            <div className="table__felt" aria-hidden />

            <OpponentRow
                state={state}
                opponents={opponents}
                leaderId={leaderId}
                countOf={countOf}
                compact={breakpoint === 'mobile'}
            />

            <div className="board">
                <StatusLine
                    state={state}
                    reveal={reveal}
                    dealing={deal.counts !== null}
                    leaderId={leaderId}
                />
                <div className="board__row">
                    <DeckSpot count={deckSize} dealing={deal.counts !== null} />
                    <PlayArea
                        state={state}
                        reveal={reveal}
                        tableRef={tableRef}
                        compact={compact}
                        handCard={compact && hand.showCard ? handCard : null}
                    />
                    <PotSpot count={potSize} />
                </div>
            </div>

            <MyZone
                state={state}
                me={me}
                count={me ? countOf(me) : 0}
                hand={hand}
                isLeader={leaderId === state.yourId}
                handCard={compact ? null : handCard}
            />

            {deal.counts ? (
                <DealLayer key="deal" state={state} tableRef={tableRef} onLand={deal.land} />
            ) : null}

            <AnimatePresence>
                {reveal?.stage === 'result' ? (
                    <RoundResultBanner
                        key={`result-${reveal.result.index}`}
                        state={state}
                        reveal={reveal}
                    />
                ) : null}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------- Deal

interface DealCounts {
    counts: Record<string, number> | null;
    deckLeft: number;
    land: (playerId: string, cards: number) => void;
}

/** While the deal plays, every pile starts empty and grows as each card lands on it. */
function useDealCounts(state: RedactedMatchState, dealing: boolean): DealCounts {
    const [counts, setCounts] = useState<Record<string, number> | null>(null);
    const totalDeck = state.config.packs * state.config.cardsPerPack;
    const [landed, setLanded] = useState(0);

    useEffect(() => {
        if (dealing) {
            setCounts({});
            setLanded(0);
        } else {
            setCounts(null);
        }
    }, [dealing]);

    return {
        counts: dealing ? (counts ?? {}) : null,
        deckLeft: Math.max(0, totalDeck - landed),
        land: (playerId, cards) => {
            setCounts((current) => ({
                ...current,
                [playerId]: (current?.[playerId] ?? 0) + cards,
            }));
            setLanded((value) => value + cards);
        },
    };
}

interface Flight {
    id: number;
    playerId: string;
    cards: number;
    delay: number;
    to: { x: number; y: number };
}

/** Shuffle on the deck spot, then deal round-robin to every pile, one flight per card. */
function DealLayer({
    state,
    tableRef,
    onLand,
}: {
    state: RedactedMatchState;
    tableRef: RefObject<HTMLDivElement>;
    onLand: (playerId: string, cards: number) => void;
}): JSX.Element {
    const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
    const [flights, setFlights] = useState<Flight[]>([]);

    useLayoutEffect(() => {
        const table = tableRef.current;
        const deck = table?.querySelector('[data-deck-anchor]');
        if (!table || !deck) return;
        setOrigin(centerIn(table, deck));

        // Real deal order: one card at a time around the table, in seating order.
        const receivers = state.players
            .filter((player) => !player.isSpectator || player.isEliminated)
            .map((player) => ({ id: player.id, total: player.cardCount }));
        const order: string[] = [];
        const max = Math.max(0, ...receivers.map((receiver) => receiver.total));
        for (let lap = 0; lap < max; lap++) {
            for (const receiver of receivers) if (lap < receiver.total) order.push(receiver.id);
        }
        const perFlight = Math.max(1, Math.ceil(order.length / MAX_DEAL_FLIGHTS));
        const planned: Flight[] = [];
        for (let index = 0; index < order.length; index += perFlight) {
            const playerId = order[index]!;
            const pile = table.querySelector(`[data-pile-id="${CSS.escape(playerId)}"]`);
            const cards = order
                .slice(index, index + perFlight)
                .filter((id) => id === playerId).length;
            planned.push({
                id: index,
                playerId,
                cards,
                delay: SHUFFLE_MS + (index / Math.max(1, order.length)) * DEAL_WINDOW_MS,
                to: pile ? centerIn(table, pile) : centerIn(table, deck),
            });
        }
        // Chunks keep each receiver's total exact even when a flight carries several cards.
        const assigned: Record<string, number> = {};
        for (const flight of planned)
            assigned[flight.playerId] = (assigned[flight.playerId] ?? 0) + flight.cards;
        for (const receiver of receivers) {
            const missing = receiver.total - (assigned[receiver.id] ?? 0);
            const last = [...planned].reverse().find((flight) => flight.playerId === receiver.id);
            if (last && missing !== 0) last.cards += missing;
        }
        setFlights(planned);
        // Measured once, when the deal starts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!origin) return <div className="deal-layer" aria-hidden />;

    return (
        <div className="deal-layer" aria-hidden>
            {[0, 1, 2, 3].map((index) => (
                <motion.div
                    key={`shuffle-${index}`}
                    className="deal-layer__card"
                    style={{ left: origin.x, top: origin.y }}
                    initial={{ x: '-50%', y: '-50%' }}
                    animate={{
                        x:
                            index % 2 === 0
                                ? ['-50%', '-110%', '-50%', '-80%', '-50%']
                                : ['-50%', '10%', '-50%', '-20%', '-50%'],
                        rotate: index % 2 === 0 ? [0, -10, 0, -6, 0] : [0, 10, 0, 6, 0],
                        opacity: [1, 1, 1, 1, 0],
                    }}
                    transition={{ duration: SHUFFLE_MS / 1000, ease: 'easeInOut' }}
                >
                    <CardBack size="xs" />
                </motion.div>
            ))}
            {flights.map((flight) => (
                <motion.div
                    key={flight.id}
                    className="deal-layer__card"
                    style={{ left: origin.x, top: origin.y }}
                    initial={{ x: '-50%', y: '-50%', opacity: 0, rotate: 0 }}
                    animate={{
                        x: `calc(-50% + ${flight.to.x - origin.x}px)`,
                        y: `calc(-50% + ${flight.to.y - origin.y}px)`,
                        opacity: [0, 1, 1, 0],
                        rotate: (flight.id % 5) * 8 - 16,
                    }}
                    transition={{
                        delay: flight.delay / 1000,
                        duration: 0.45,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                    onAnimationComplete={() => onLand(flight.playerId, flight.cards)}
                >
                    <CardBack size="xs" />
                </motion.div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------- Piles & spots

/** A face-down pile drawn with real thickness; empty (just an outline) until cards land. */
function Pile({ playerId, count }: { playerId: string; count: number }): JSX.Element {
    const { t } = useTranslation();
    const layers = count === 0 ? 0 : Math.min(4, Math.ceil(count / 5));

    return (
        <div className="pile" data-pile-id={playerId} aria-label={t('common.cards', { count })}>
            {layers === 0 ? <span className="pile__empty" /> : null}
            {Array.from({ length: layers }, (_, index) => (
                <CardBack
                    key={index}
                    size="xs"
                    className="pile__card"
                    style={{ transform: `translate(${index * 1.5}px, ${-index * 2}px)` }}
                />
            ))}
            {count > 0 ? (
                <motion.span
                    key={count}
                    className="pile__count tabular"
                    initial={{ scale: 1.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.5, duration: 0.45 }}
                >
                    {count}
                </motion.span>
            ) : null}
        </div>
    );
}

function DeckSpot({ count, dealing }: { count: number; dealing: boolean }): JSX.Element {
    const { t } = useTranslation();
    return (
        <div className="spot spot--deck" data-deck-anchor data-tip={t('table.deckHint')}>
            <div className="spot__stack">
                {count > 0 ? (
                    Array.from({ length: Math.min(4, Math.ceil(count / 8)) }, (_, index) => (
                        <CardBack
                            key={index}
                            size="xs"
                            className="spot__card"
                            style={{ transform: `translate(${index * 1.5}px, ${-index * 2}px)` }}
                        />
                    ))
                ) : (
                    <span className="spot__empty" />
                )}
                {count > 0 ? <span className="pile__count tabular">{count}</span> : null}
            </div>
            <span className="spot__label">
                {t('table.deck')}
                {!dealing && count > 0 ? (
                    <span className="spot__sub">{t('table.outOfPlay')}</span>
                ) : null}
            </span>
        </div>
    );
}

function PotSpot({ count }: { count: number }): JSX.Element {
    const { t } = useTranslation();
    return (
        <div
            className={`spot spot--pot ${count > 0 ? 'is-active' : ''}`}
            data-pot-anchor
            data-tip={t('table.potHint')}
        >
            <div className="spot__stack">
                {count > 0 ? (
                    Array.from({ length: Math.min(5, count) }, (_, index) => (
                        <CardBack
                            key={index}
                            size="xs"
                            className="spot__card"
                            style={{ transform: `rotate(${(index - 2) * 11}deg)` }}
                        />
                    ))
                ) : (
                    <span className="spot__empty" />
                )}
                {count > 0 ? (
                    <span className="pile__count pile__count--pot tabular">{count}</span>
                ) : null}
            </div>
            <span className="spot__label">{t('table.pot')}</span>
        </div>
    );
}

// ---------------------------------------------------------------- Opponents

function seatStatus(
    t: ReturnType<typeof useTranslation>['t'],
    state: RedactedMatchState,
    player: Player,
    isLeader: boolean,
): string {
    if (player.hasLeft) return t('table.status.left');
    if (player.isEliminated) return t('table.status.out');
    if (state.phase === 'AWAITING_ATTRIBUTE' && isLeader) return t('table.status.choosing');
    if (state.phase === 'AWAITING_CARDS') {
        return state.round?.playedBy.includes(player.id)
            ? t('table.status.played')
            : t('table.status.playing');
    }
    return isLeader ? t('table.status.leader') : '';
}

function OpponentRow({
    state,
    opponents,
    leaderId,
    countOf,
    compact,
}: {
    state: RedactedMatchState;
    opponents: Player[];
    leaderId: string | null;
    countOf: (player: Player) => number;
    compact: boolean;
}): JSX.Element {
    const { t } = useTranslation();
    return (
        <ul
            className={`opponents ${compact ? 'opponents--compact' : ''}`}
            aria-label={t('table.rivals')}
        >
            {opponents.map((player) => (
                <li key={player.id} className={`opponent ${player.isEliminated ? 'is-out' : ''}`}>
                    <Seat
                        player={player}
                        count={countOf(player)}
                        isLeader={leaderId === player.id}
                        status={seatStatus(t, state, player, leaderId === player.id)}
                        compact={compact}
                    />
                </li>
            ))}
        </ul>
    );
}

function Seat({
    player,
    count,
    isLeader,
    status,
    you = false,
    compact = false,
}: {
    player: Player;
    count: number;
    isLeader: boolean;
    status: string;
    you?: boolean;
    compact?: boolean;
}): JSX.Element {
    const { t } = useTranslation();
    return (
        <div
            className={[
                'seat',
                isLeader && 'seat--leader',
                you && 'seat--you',
                compact && 'seat--compact',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <div className="seat__avatar">
                <Avatar
                    seed={player.avatarSeed}
                    size={compact ? 34 : 44}
                    active={isLeader}
                    label={player.nickname}
                />
                {isLeader ? (
                    <span className="seat__crown" aria-label={t('table.status.leader')}>
                        <Icon name="crown" />
                    </span>
                ) : null}
            </div>
            <div className="seat__info">
                <strong className="seat__name">
                    {you ? t('common.youSuffix', { name: player.nickname }) : player.nickname}
                </strong>
                <span className="seat__status">{status || ' '}</span>
            </div>
            <Pile playerId={player.id} count={count} />
        </div>
    );
}

// ---------------------------------------------------------------- Status line

function StatusLine({
    state,
    reveal,
    dealing,
    leaderId,
}: {
    state: RedactedMatchState;
    reveal: RevealState | null;
    dealing: boolean;
    leaderId: string | null;
}): JSX.Element {
    const { t } = useTranslation();
    const { l } = useLocale();
    const leader = state.players.find((player) => player.id === leaderId);
    const attributeKey = reveal?.attribute ?? state.round?.attribute ?? null;
    const attribute = attributeKey ? attributeMeta('pokeapi', attributeKey) : null;

    let tone = '';
    let content: JSX.Element | string;
    if (dealing) {
        content = t('table.line.dealing');
    } else if (reveal) {
        content = (
            <>
                {attribute ? <Icon name={attribute.icon} /> : null}{' '}
                {t('table.line.comparing', { attribute: attribute ? l(attribute.label) : '' })}
            </>
        );
    } else if (state.phase === 'AWAITING_ATTRIBUTE') {
        tone = leaderId === state.yourId ? 'status-line--turn' : '';
        content =
            leaderId === state.yourId
                ? t('table.line.yourTurn')
                : t('table.line.choosing', { name: leader?.nickname ?? '' });
    } else if (state.phase === 'AWAITING_CARDS' && attribute) {
        content = (
            <>
                <Icon name={attribute.icon} /> {t('table.line.playing')}{' '}
                <strong>{l(attribute.label)}</strong>
            </>
        );
    } else {
        content = t('table.line.setting');
    }

    return (
        <div className="status-slot" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={
                        typeof content === 'string'
                            ? content
                            : `${state.phase}-${attributeKey}-${reveal ? 'r' : ''}`
                    }
                    className={`status-line ${tone}`}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.2 }}
                >
                    {content}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------- Play area

function PlayArea({
    state,
    reveal,
    tableRef,
    compact,
    handCard,
}: {
    state: RedactedMatchState;
    reveal: RevealState | null;
    tableRef: RefObject<HTMLDivElement>;
    compact: boolean;
    /** On phones my card is chosen right here, in the middle of the table. */
    handCard: JSX.Element | null;
}): JSX.Element {
    const [stageRef, stage] = useElementSize<HTMLDivElement>();
    const playersById = new Map(state.players.map((player) => [player.id, player]));
    const result = reveal?.result ?? null;
    const showOutcome = reveal !== null && reveal.stage !== 'landing' && reveal.stage !== 'flip';
    const attributeKey = reveal?.attribute ?? state.round?.attribute ?? null;
    const attribute = attributeKey ? attributeMeta('pokeapi', attributeKey) : null;
    const { t } = useTranslation();

    const inPlay = reveal
        ? Object.keys(reveal.cards)
        : state.phase === 'AWAITING_CARDS'
          ? (state.round?.playOrder ?? [])
          : [];
    // Rivals' cards face them; mine always lands last, on my side of the table.
    const slotIds = [
        ...inPlay.filter((id) => id !== state.yourId),
        ...inPlay.filter((id) => id === state.yourId),
    ];

    const fit = fitCards(slotIds.length, stage.width, stage.height, compact ? 240 : 230);
    const handWidth = Math.floor(
        Math.min(compact ? 280 : 250, stage.width * 0.86, (stage.height - 8) / 1.4),
    );

    return (
        <div
            ref={stageRef}
            className="play-area"
            style={{
                ['--slot-w' as string]: `${Math.max(56, fit.cardWidth)}px`,
                ['--card-lg' as string]: `${Math.max(120, handWidth)}px`,
                gridTemplateColumns: `repeat(${fit.columns}, auto)`,
            }}
        >
            {slotIds.length === 0 ? (
                handCard ? (
                    <div className="play-area__hand">{handCard}</div>
                ) : (
                    <div className="play-area__empty" aria-hidden>
                        <Icon name="sword-clash" />
                    </div>
                )
            ) : null}
            {slotIds.map((playerId, index) => {
                const player = playersById.get(playerId);
                // While the last card is still landing, every card keeps its face down.
                const revealed =
                    reveal && reveal.stage !== 'landing' ? reveal.cards[playerId] : undefined;
                const played =
                    reveal !== null || (state.round?.playedBy.includes(playerId) ?? false);
                const isMine = playerId === state.yourId;
                const outcome: CardOutcome =
                    showOutcome && result
                        ? result.isTie
                            ? 'tie'
                            : playerId === result.winnerId
                              ? 'win'
                              : 'lose'
                        : null;
                const collectTo =
                    reveal?.stage === 'collect' && result
                        ? result.isTie
                            ? '[data-pot-anchor]'
                            : `[data-pile-id="${CSS.escape(result.winnerId ?? '')}"]`
                        : null;
                // Every card lands face down - mine too - and they all flip together at the
                // reveal: nobody sees a stat before the comparison.
                const faceUpCard = revealed ?? null;

                return (
                    <div className="slot" key={playerId}>
                        {played ? (
                            <FlyingCard
                                from={
                                    isMine
                                        ? [
                                              '[data-my-card] .my-card',
                                              `[data-pile-id="${CSS.escape(playerId)}"]`,
                                          ]
                                        : [`[data-pile-id="${CSS.escape(playerId)}"]`]
                                }
                                collectTo={collectTo}
                                tableRef={tableRef}
                                index={index}
                                highlight={outcome === 'win'}
                            >
                                {faceUpCard ? (
                                    <FlipCard
                                        card={faceUpCard}
                                        outcome={outcome}
                                        attribute={attributeKey}
                                        delay={index * 0.22}
                                        startFaceUp={false}
                                    />
                                ) : (
                                    <CardBack size="md" />
                                )}
                            </FlyingCard>
                        ) : (
                            <div className="slot__empty">
                                {player ? <Avatar seed={player.avatarSeed} size={28} /> : null}
                            </div>
                        )}
                        <span className="slot__owner">
                            <span className="slot__name">
                                {isMine ? t('common.you') : player?.nickname}
                            </span>
                            {revealed && attributeKey ? (
                                <strong className="slot__value tabular">
                                    {formatStat(revealed.stats[attributeKey] ?? 0, attribute?.unit)}
                                </strong>
                            ) : null}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * One card on the table: it flies in from where it came from (the owner's pile, or my own
 * card in my zone) and, once collected, flies to the winner's pile or into the pot - both
 * measured live from the DOM, so it lands on the real spot at any screen size.
 *
 * Fully declarative: the wrapper is measured first, then the moving card mounts with its
 * starting offset as `initial` and its destination as `animate`. No imperative animation
 * controls, so a round can never lose a card because an animation fired before mounting.
 */
function FlyingCard({
    children,
    from: sources,
    collectTo,
    tableRef,
    index,
    highlight,
}: {
    children: JSX.Element;
    /** Where the card comes from, most specific first (the first one on screen wins). */
    from: string[];
    collectTo: string | null;
    tableRef: RefObject<HTMLDivElement>;
    index: number;
    highlight: boolean;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [from, setFrom] = useState<Offset | null>(null);
    const [to, setTo] = useState<Offset | null>(null);

    useLayoutEffect(() => {
        const table = tableRef.current;
        const source = sources
            .map((selector) => table?.querySelector(selector))
            .find((element) => element !== null && element !== undefined);
        setFrom(offsetBetween(source, ref.current));
        // Only where the card came from matters, measured once on arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
        if (!collectTo) return;
        const target = offsetBetween(tableRef.current?.querySelector(collectTo), ref.current);
        setTo(target ?? { x: 0, y: 0, scale: 1 });
    }, [collectTo, tableRef]);

    return (
        <div ref={ref} className="flying">
            {from ? (
                <motion.div
                    initial={{ x: from.x, y: from.y, scale: from.scale, opacity: 1 }}
                    animate={
                        to
                            ? {
                                  x: to.x,
                                  y: to.y,
                                  scale: 0.3,
                                  opacity: 0,
                                  transition: {
                                      duration: 0.8,
                                      delay: index * 0.1,
                                      ease: [0.5, 0, 0.2, 1],
                                  },
                              }
                            : { x: 0, y: 0, scale: highlight ? 1.03 : 1, opacity: 1 }
                    }
                    transition={cardTravel}
                >
                    {children}
                </motion.div>
            ) : (
                <div style={{ visibility: 'hidden' }}>{children}</div>
            )}
        </div>
    );
}

interface Offset {
    x: number;
    y: number;
    scale: number;
}

/** How far (and how much bigger) `source` is from `anchor`, center to center. */
function offsetBetween(
    source: Element | null | undefined,
    anchor: HTMLElement | null,
): Offset | null {
    if (!anchor) return null;
    if (!source) return { x: 0, y: 0, scale: 1 };
    const from = source.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    return {
        x: from.left + from.width / 2 - (box.left + box.width / 2),
        y: from.top + from.height / 2 - (box.top + box.height / 2),
        scale: Math.min(1.6, Math.max(0.3, from.width / Math.max(1, box.width))),
    };
}

/** Face-down → face-up 3D flip (rotateY), staggered per seat. */
function FlipCard({
    card,
    outcome,
    attribute,
    delay,
    startFaceUp,
}: {
    card: Card;
    outcome: CardOutcome;
    attribute: string | null;
    delay: number;
    startFaceUp: boolean;
}): JSX.Element {
    return (
        <div className="flip">
            <motion.div
                className="flip__inner"
                initial={{ rotateY: startFaceUp ? 0 : 180 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="flip__face">
                    <PlayingCard
                        card={card}
                        size="md"
                        outcome={outcome}
                        selectedAttribute={attribute}
                    />
                </div>
                <div className="flip__face flip__face--back">
                    <CardBack size="md" />
                </div>
            </motion.div>
        </div>
    );
}

// ---------------------------------------------------------------- Result banner

/** Covers the table (not the screen) with a blur so the result reads on its own. */
function RoundResultBanner({
    state,
    reveal,
}: {
    state: RedactedMatchState;
    reveal: RevealState;
}): JSX.Element {
    const { t } = useTranslation();
    const { l } = useLocale();
    const { result } = reveal;
    const winner = state.players.find((player) => player.id === result.winnerId);
    const attribute = attributeMeta('pokeapi', result.attribute);
    const winningCard = result.winnerId ? result.cards[result.winnerId] : undefined;
    const tone = result.isTie ? 'tie' : result.winnerId === state.yourId ? 'win' : 'lose';
    const title = result.isTie
        ? t('table.result.tie')
        : tone === 'win'
          ? t('table.result.youWin')
          : t('table.result.theyWin', { name: winner?.nickname ?? '' });
    const detail = result.isTie
        ? t('table.result.tieDetail', { count: Object.keys(result.cards).length })
        : tone === 'win'
          ? t('table.result.youTake', { count: result.potSize })
          : t('table.result.winDetail', { name: winner?.nickname ?? '', count: result.potSize });

    return (
        <motion.div
            className="round-result"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
        >
            <motion.div
                className={`round-result__card round-result__card--${tone}`}
                initial={{ scale: 0.8, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0.35, duration: 0.55 }}
            >
                <span className="round-result__icon">
                    <Icon
                        name={
                            result.isTie
                                ? 'card-pickup'
                                : tone === 'win'
                                  ? 'laurels-trophy'
                                  : 'crossed-swords'
                        }
                    />
                </span>
                <strong className="round-result__title">{title}</strong>
                <span className="round-result__detail">{detail}</span>
                <span className="round-result__stat">
                    <Icon name={attribute.icon} /> {l(attribute.label)}
                    {winningCard ? (
                        <b className="tabular">
                            {formatStat(winningCard.stats[result.attribute] ?? 0, attribute.unit)}
                        </b>
                    ) : null}
                </span>
            </motion.div>
        </motion.div>
    );
}

// ---------------------------------------------------------------- Me

interface HandState {
    card: Card | null;
    /** The top card is visible (between rounds, before it is laid down). */
    showCard: boolean;
    /** I lead and the turn is open: the attribute rows are buttons. */
    choosing: boolean;
    busy: boolean;
}

function useHand(
    state: RedactedMatchState,
    {
        busy,
        isLeader,
        myPlayedCard,
    }: { busy: boolean; isLeader: boolean; myPlayedCard: Card | null },
): HandState {
    const now = useNow(250, state.turnOpensAt !== null && state.turnOpensAt > Date.now());
    const card = state.yourTopCard;
    const turnOpen = state.turnOpensAt === null || Math.max(now, Date.now()) >= state.turnOpensAt;
    return {
        card,
        showCard: card !== null && !busy && !myPlayedCard && state.phase === 'AWAITING_ATTRIBUTE',
        choosing: state.phase === 'AWAITING_ATTRIBUTE' && isLeader && !busy && turnOpen,
        busy,
    };
}

/** My top card, face up. Only one card is ever visible; once laid down it lives on the table,
 *  so this spot stays empty (never a face-down card) until the next round. */
function HandCard({
    hand,
    onSelectAttribute,
}: {
    hand: HandState;
    onSelectAttribute: (attribute: string) => void;
}): JSX.Element {
    return (
        <div className="my-zone__card" data-my-card>
            <AnimatePresence initial={false}>
                {hand.showCard && hand.card ? (
                    <motion.div
                        key={hand.card.code}
                        className="my-card"
                        initial={{ opacity: 0, y: 50, rotateY: 80 }}
                        animate={{ opacity: 1, y: 0, rotateY: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        transition={cardTravel}
                    >
                        <PlayingCard
                            card={hand.card}
                            size="lg"
                            {...(hand.choosing ? { onSelectAttribute } : {})}
                        />
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <div className="my-card my-card--empty" aria-hidden />
        </div>
    );
}

function MyZone({
    state,
    me,
    count,
    hand,
    isLeader,
    handCard,
}: {
    state: RedactedMatchState;
    me: Player | undefined;
    count: number;
    hand: HandState;
    isLeader: boolean;
    /** Desktop and tablets: my card sits here. Phones: it moves to the middle of the table. */
    handCard: JSX.Element | null;
}): JSX.Element {
    const { t } = useTranslation();

    if (!me || me.isSpectator || me.isEliminated) {
        return (
            <section className="my-zone my-zone--spectator">
                <Icon name="hooded-figure" size={34} />
                <p>{me?.isEliminated ? t('table.spectator.out') : t('table.spectator.watching')}</p>
            </section>
        );
    }

    return (
        <section
            className={`my-zone ${hand.choosing ? 'my-zone--active' : ''} ${handCard ? '' : 'my-zone--bar'}`}
            aria-label={t('table.myZone')}
        >
            <TurnTimer state={state} active={hand.choosing} />
            <div className="my-zone__row">
                <div className="my-zone__seat">
                    <Seat
                        player={me}
                        count={count}
                        isLeader={isLeader}
                        status={seatStatus(t, state, me, isLeader)}
                        you
                    />
                </div>

                {handCard}

                <p className="my-zone__hint">
                    {hand.choosing
                        ? t('table.hint.choose')
                        : state.phase === 'AWAITING_CARDS'
                          ? t('table.hint.playing')
                          : hand.busy
                            ? t('table.hint.watch')
                            : isLeader
                              ? t('table.hint.getReady')
                              : t('table.hint.wait')}
                </p>
            </div>
        </section>
    );
}

function TurnTimer({ state, active }: { state: RedactedMatchState; active: boolean }): JSX.Element {
    const { t } = useTranslation();
    const now = useNow(200, state.turnDeadline !== null && active);
    const enabled = state.turnDeadline !== null && state.config.turnTimeoutMs > 0 && active;
    const remaining = enabled ? Math.max(0, state.turnDeadline! - now) : 0;
    const ratio = enabled ? Math.min(1, remaining / state.config.turnTimeoutMs) : 0;
    const tone = ratio > 0.5 ? 'calm' : ratio > 0.2 ? 'warn' : 'urgent';
    const seconds = Math.ceil(remaining / 1000);

    return (
        <div
            className={`turn-timer turn-timer--${tone} ${enabled ? '' : 'turn-timer--idle'}`}
            role="timer"
            aria-label={enabled ? t('table.timer', { count: seconds }) : t('table.noTurn')}
        >
            <span className="turn-timer__track">
                <span className="turn-timer__bar" style={{ transform: `scaleX(${ratio})` }} />
            </span>
            <span className="turn-timer__text tabular">
                {enabled ? t('format.seconds', { count: seconds }) : ''}
            </span>
        </div>
    );
}
