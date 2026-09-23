import type { Card, Player, RedactedMatchState } from '@kardux/contracts';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import type { JSX, RefObject } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CardBack, PlayingCard } from '../../components/cards/PlayingCard';
import type { CardOutcome, CardSize } from '../../components/cards/PlayingCard';
import { Avatar } from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import type { Breakpoint } from '../../hooks/useBreakpoint';
import { useNow } from '../../hooks/useNow';
import { attributeMeta, formatStat } from '../../lib/deck-meta';
import type { RevealState } from './useMatchSession';
import { DEAL_MS } from './useMatchSession';

interface GameTableProps {
    state: RedactedMatchState;
    reveal: RevealState | null;
    dealing: boolean;
    myPlayedCard: Card | null;
    breakpoint: Breakpoint;
    onSelectAttribute: (attribute: string) => void;
}

/** Soft, readable motion: cards travel like real cards, never snap. */
const cardTravel = { type: 'spring', stiffness: 150, damping: 22, mass: 1 } as const;

function currentLeaderId(state: RedactedMatchState): string | null {
    if (state.phase === 'AWAITING_ATTRIBUTE')
        return state.turnOrder[state.currentTurnIndex] ?? null;
    return state.round?.leaderId ?? null;
}

export function GameTable({
    state,
    reveal,
    dealing,
    myPlayedCard,
    breakpoint,
    onSelectAttribute,
}: GameTableProps): JSX.Element {
    const tableRef = useRef<HTMLDivElement>(null);
    const me = state.players.find((player) => player.id === state.yourId);
    const opponents = state.players.filter(
        (player) => player.id !== state.yourId && !player.isSpectator,
    );
    const leaderId = currentLeaderId(state);
    const busy = reveal !== null || dealing;

    return (
        <div className={`table table--${breakpoint}`} ref={tableRef}>
            <div className="table__felt" aria-hidden />

            <OpponentRow state={state} opponents={opponents} leaderId={leaderId} />

            <CenterStage
                state={state}
                reveal={reveal}
                myPlayedCard={myPlayedCard}
                leaderId={leaderId}
                breakpoint={breakpoint}
                tableRef={tableRef}
            />

            <MyZone
                state={state}
                me={me}
                busy={busy}
                isLeader={leaderId === state.yourId}
                myPlayedCard={myPlayedCard}
                breakpoint={breakpoint}
                onSelectAttribute={onSelectAttribute}
            />

            <AnimatePresence>
                {dealing ? <DealOverlay state={state} tableRef={tableRef} key="deal" /> : null}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------- Piles

/** A player's face-down pile, drawn with real thickness: more cards, taller stack. */
function PileStack({
    playerId,
    count,
    size = 'xs',
}: {
    playerId: string;
    count: number;
    size?: CardSize;
}): JSX.Element {
    const layers = count === 0 ? 0 : Math.min(5, Math.ceil(count / 4));

    return (
        <div
            className={`pile pile--${size}`}
            data-pile-id={playerId}
            aria-label={`${count} cartas`}
        >
            {count === 0 ? (
                <span className={`pile__empty pcard--${size}`} />
            ) : (
                Array.from({ length: layers }, (_, index) => (
                    <CardBack
                        key={index}
                        size={size}
                        className="pile__card"
                        style={{ transform: `translate(${index * 1.5}px, ${-index * 2.5}px)` }}
                    />
                ))
            )}
            <motion.span
                key={count}
                className="pile__count tabular"
                initial={{ scale: 1.5 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }}
            >
                {count}
            </motion.span>
        </div>
    );
}

// ---------------------------------------------------------------- Opponents

function OpponentRow({
    state,
    opponents,
    leaderId,
}: {
    state: RedactedMatchState;
    opponents: Player[];
    leaderId: string | null;
}): JSX.Element {
    return (
        <ul className="opponents" aria-label="Rivales">
            {opponents.map((player) => (
                <motion.li
                    key={player.id}
                    className="opponent"
                    layout
                    animate={
                        player.isEliminated
                            ? { opacity: 0.45, scale: 0.92, filter: 'grayscale(1)' }
                            : { opacity: 1, scale: 1, filter: 'grayscale(0)' }
                    }
                    transition={{ duration: 0.6 }}
                >
                    <Seat state={state} player={player} isLeader={leaderId === player.id} />
                </motion.li>
            ))}
        </ul>
    );
}

function seatStatus(state: RedactedMatchState, player: Player, isLeader: boolean): string {
    if (player.isEliminated) return 'Eliminado';
    if (state.phase === 'AWAITING_ATTRIBUTE' && isLeader) return 'Eligiendo atributo…';
    if (state.phase === 'AWAITING_CARDS') {
        return state.round?.playedBy.includes(player.id) ? 'Carta en mesa' : 'Lanzando…';
    }
    return isLeader ? 'Líder' : '';
}

function Seat({
    state,
    player,
    isLeader,
    you = false,
}: {
    state: RedactedMatchState;
    player: Player;
    isLeader: boolean;
    you?: boolean;
}): JSX.Element {
    const status = seatStatus(state, player, isLeader);

    return (
        <div className={`seat ${isLeader ? 'seat--leader' : ''} ${you ? 'seat--you' : ''}`}>
            <div className="seat__avatar">
                <Avatar
                    seed={player.avatarSeed}
                    size={44}
                    active={isLeader}
                    label={player.nickname}
                />
                {isLeader ? (
                    <span className="seat__crown" aria-label="Líder de la ronda">
                        <Icon name="crown" />
                    </span>
                ) : null}
            </div>
            <div className="seat__info">
                <strong className="seat__name">
                    {you ? `${player.nickname} (tú)` : player.nickname}
                </strong>
                <span className="seat__status">{status || ' '}</span>
            </div>
            <PileStack playerId={player.id} count={player.cardCount} />
        </div>
    );
}

// ---------------------------------------------------------------- Center

function CenterStage({
    state,
    reveal,
    myPlayedCard,
    leaderId,
    breakpoint,
    tableRef,
}: {
    state: RedactedMatchState;
    reveal: RevealState | null;
    myPlayedCard: Card | null;
    leaderId: string | null;
    breakpoint: Breakpoint;
    tableRef: RefObject<HTMLDivElement>;
}): JSX.Element {
    const playersById = new Map(state.players.map((player) => [player.id, player]));
    const cardSize: CardSize = breakpoint === 'mobile' ? 'sm' : 'md';
    const leader = leaderId ? playersById.get(leaderId) : undefined;
    const attributeKey = reveal?.attribute || state.round?.attribute || null;
    const source = state.config.deckSources[0] ?? 'pokeapi';
    const attribute = attributeKey ? attributeMeta(source, attributeKey) : null;
    const result = reveal?.result ?? null;
    const showResult = result !== null && reveal?.stage !== 'flip';
    const winnerId = result?.winnerId ?? null;
    const isTie = result?.isTie ?? false;

    const slotIds = reveal
        ? Object.keys(reveal.cards)
        : state.phase === 'AWAITING_CARDS'
          ? (state.round?.playOrder ?? [])
          : [];

    let banner: JSX.Element;
    if (showResult && result) {
        const winner = winnerId ? playersById.get(winnerId) : undefined;
        banner = isTie ? (
            <motion.div
                key="tie"
                className="banner banner--tie"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
            >
                ¡Empate! Las cartas van al pozo
            </motion.div>
        ) : (
            <motion.div
                key="win"
                className={`banner ${winnerId === state.yourId ? 'banner--win' : 'banner--lose'}`}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.4, duration: 0.8 }}
            >
                {winnerId === state.yourId ? '¡Ganas la ronda!' : `Gana ${winner?.nickname ?? '…'}`}
                <span className="banner__sub">+{result.potSize} cartas</span>
            </motion.div>
        );
    } else if (reveal) {
        banner = (
            <div className="banner">
                {attribute ? <Icon name={attribute.icon} /> : null} Revelando cartas…
            </div>
        );
    } else if (state.phase === 'AWAITING_ATTRIBUTE') {
        banner =
            leaderId === state.yourId ? (
                <div className="banner banner--turn">¡Tu turno! Elige el atributo de tu carta</div>
            ) : (
                <div className="banner">
                    {leader?.nickname ?? 'El líder'} está eligiendo atributo…
                </div>
            );
    } else if (state.phase === 'AWAITING_CARDS' && attribute) {
        banner = (
            <div className="banner">
                <Icon name={attribute.icon} /> Se juega <strong>{attribute.label}</strong>
            </div>
        );
    } else {
        banner = <div className="banner">Preparando la mesa…</div>;
    }

    return (
        <section className="center" aria-live="polite">
            {banner}
            <div className="center__board">
                <PotPile potSize={state.potSize} />
                <div className="center__cards">
                    <AnimatePresence mode="popLayout">
                        {slotIds.map((playerId, index) => {
                            const player = playersById.get(playerId);
                            const revealed = reveal?.cards[playerId];
                            const played = state.round?.playedBy.includes(playerId) ?? false;
                            const isMine = playerId === state.yourId;
                            const outcome: CardOutcome = showResult
                                ? isTie
                                    ? 'tie'
                                    : playerId === winnerId
                                      ? 'win'
                                      : 'lose'
                                : null;
                            const collectTo =
                                reveal?.stage === 'collect'
                                    ? isTie
                                        ? '[data-pot-anchor]'
                                        : `[data-pile-id="${winnerId ?? ''}"]`
                                    : null;

                            return (
                                <CenterSlot
                                    key={playerId}
                                    fromMe={isMine}
                                    index={index}
                                    count={slotIds.length}
                                    collectTo={collectTo}
                                    tableRef={tableRef}
                                    highlight={outcome === 'win'}
                                >
                                    {revealed ? (
                                        <FlipCard
                                            card={revealed}
                                            size={cardSize}
                                            outcome={outcome}
                                            attribute={attributeKey}
                                            delay={index * 0.28}
                                            startFaceUp={isMine}
                                        />
                                    ) : isMine && played && myPlayedCard ? (
                                        <PlayingCard
                                            card={myPlayedCard}
                                            size={cardSize}
                                            selectedAttribute={attributeKey}
                                        />
                                    ) : played ? (
                                        <CardBack size={cardSize} />
                                    ) : (
                                        <div className={`slot-empty pcard--${cardSize}`}>
                                            {player ? (
                                                <Avatar seed={player.avatarSeed} size={30} />
                                            ) : null}
                                        </div>
                                    )}
                                    <span className="center__owner">
                                        {isMine ? 'Tú' : player?.nickname}
                                        {revealed && attributeKey ? (
                                            <strong className="center__value tabular">
                                                {formatStat(
                                                    revealed.stats[attributeKey] ?? 0,
                                                    attribute?.unit,
                                                )}
                                            </strong>
                                        ) : null}
                                    </span>
                                </CenterSlot>
                            );
                        })}
                    </AnimatePresence>
                    {slotIds.length === 0 && state.potSize === 0 ? (
                        <div className="center__empty" aria-hidden>
                            <Icon name="sword-clash" />
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

/**
 * One card on the table. Enters from its owner's side, and when the round is collected flies to
 * the winner's pile (measured live from the DOM, so it lands on the real seat at any size).
 */
function CenterSlot({
    children,
    fromMe,
    index,
    count,
    collectTo,
    tableRef,
    highlight,
}: {
    children: JSX.Element[];
    fromMe: boolean;
    index: number;
    count: number;
    collectTo: string | null;
    tableRef: RefObject<HTMLDivElement>;
    highlight: boolean;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const controls = useAnimationControls();
    const reduceMotion = useReducedMotion();
    const tilt = reduceMotion ? 0 : (index - (count - 1) / 2) * 3;

    useEffect(() => {
        void controls.start({ opacity: 1, x: 0, y: 0, rotate: tilt, scale: 1 });
    }, [controls, tilt]);

    useEffect(() => {
        void controls.start(highlight ? { scale: 1.08, rotate: 0 } : { scale: 1, rotate: tilt });
    }, [controls, highlight, tilt]);

    useLayoutEffect(() => {
        if (!collectTo || !ref.current) return;
        const target = tableRef.current?.querySelector(collectTo);
        if (!target) return;
        const from = ref.current.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        void controls.start({
            x: to.left + to.width / 2 - (from.left + from.width / 2),
            y: to.top + to.height / 2 - (from.top + from.height / 2),
            scale: 0.28,
            rotate: 0,
            opacity: 0.15,
            transition: { duration: 0.95, delay: index * 0.12, ease: [0.5, 0, 0.2, 1] },
        });
    }, [collectTo, controls, index, tableRef]);

    return (
        <motion.div
            ref={ref}
            className="center__slot"
            initial={{ opacity: 0, y: fromMe ? 180 : -180, rotate: tilt * 3, scale: 0.9 }}
            animate={controls}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={cardTravel}
        >
            {children}
        </motion.div>
    );
}

/** Cards left on the table by ties: the pot, visible until someone wins it. */
function PotPile({ potSize }: { potSize: number }): JSX.Element {
    return (
        <div className={`pot ${potSize > 0 ? 'pot--active' : ''}`} data-pot-anchor>
            <AnimatePresence>
                {potSize > 0 ? (
                    <motion.div
                        className="pot__stack"
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                    >
                        {Array.from({ length: Math.min(potSize, 6) }, (_, index) => (
                            <CardBack
                                key={index}
                                size="xs"
                                className="pot__card"
                                style={{ transform: `rotate(${(index - 2.5) * 9}deg)` }}
                            />
                        ))}
                        <span className="pot__label">Pozo ×{potSize}</span>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

/** Face-down → face-up 3D flip (rotateY), staggered per seat. */
function FlipCard({
    card,
    size,
    outcome,
    attribute,
    delay,
    startFaceUp,
}: {
    card: Card;
    size: CardSize;
    outcome: CardOutcome;
    attribute: string | null;
    delay: number;
    startFaceUp: boolean;
}): JSX.Element {
    return (
        <div className={`flip pcard--${size}`}>
            <motion.div
                className="flip__inner"
                initial={{ rotateY: startFaceUp ? 0 : 180 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="flip__face">
                    <PlayingCard
                        card={card}
                        size={size}
                        outcome={outcome}
                        selectedAttribute={attribute}
                    />
                </div>
                <div className="flip__face flip__face--back">
                    <CardBack size={size} />
                </div>
            </motion.div>
        </div>
    );
}

// ---------------------------------------------------------------- Me

function MyZone({
    state,
    me,
    busy,
    isLeader,
    myPlayedCard,
    breakpoint,
    onSelectAttribute,
}: {
    state: RedactedMatchState;
    me: Player | undefined;
    busy: boolean;
    isLeader: boolean;
    myPlayedCard: Card | null;
    breakpoint: Breakpoint;
    onSelectAttribute: (attribute: string) => void;
}): JSX.Element {
    const card = state.yourTopCard;
    const choosing = state.phase === 'AWAITING_ATTRIBUTE' && isLeader && !busy;
    // After our card is laid down the next one stays hidden until the round is over.
    const showCard = card && !busy && !myPlayedCard && state.phase === 'AWAITING_ATTRIBUTE';

    if (!me || me.isSpectator || me.isEliminated) {
        return (
            <section className="my-zone my-zone--spectator">
                <Icon name="hooded-figure" size={34} />
                <p>
                    {me?.isEliminated
                        ? 'Te quedaste sin cartas. Sigues mirando la partida.'
                        : 'Estás mirando como espectador.'}
                </p>
            </section>
        );
    }

    return (
        <section className={`my-zone ${choosing ? 'my-zone--active' : ''}`} aria-label="Tu zona">
            <TurnTimer state={state} active={choosing} />

            <div className="my-zone__row">
                <div className="my-zone__seat">
                    <Seat state={state} player={me} isLeader={isLeader} you />
                </div>

                <div className="my-zone__card">
                    <AnimatePresence mode="wait">
                        {showCard ? (
                            <motion.div
                                key={card.code}
                                className="my-card"
                                initial={{ opacity: 0, y: 70, rotateY: 90 }}
                                animate={{ opacity: 1, y: 0, rotateY: 0 }}
                                exit={{ opacity: 0, y: -160, scale: 0.8 }}
                                transition={cardTravel}
                            >
                                <PlayingCard
                                    card={card}
                                    size={breakpoint === 'mobile' ? 'md' : 'lg'}
                                    {...(choosing ? { onSelectAttribute } : {})}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="waiting"
                                className="my-card my-card--waiting"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <CardBack size={breakpoint === 'mobile' ? 'md' : 'lg'} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <p className="my-zone__hint">
                    {choosing
                        ? 'Toca el atributo más fuerte de tu carta.'
                        : state.phase === 'AWAITING_CARDS'
                          ? 'Las cartas se lanzan en orden…'
                          : busy
                            ? 'Mira cómo se resuelve la ronda.'
                            : 'Espera tu turno.'}
                </p>
            </div>
        </section>
    );
}

function TurnTimer({ state, active }: { state: RedactedMatchState; active: boolean }): JSX.Element {
    const now = useNow(200, state.turnDeadline !== null);
    const enabled = state.turnDeadline !== null && state.config.turnTimeoutMs > 0 && active;
    const remaining = enabled ? Math.max(0, state.turnDeadline! - now) : 0;
    const ratio = enabled ? Math.min(1, remaining / state.config.turnTimeoutMs) : 0;
    const tone = ratio > 0.5 ? 'calm' : ratio > 0.2 ? 'warn' : 'urgent';

    return (
        <div
            className={`turn-timer turn-timer--${tone} ${enabled ? '' : 'turn-timer--idle'}`}
            role="timer"
            aria-label={
                enabled ? `${Math.ceil(remaining / 1000)} segundos para elegir` : 'Sin turno activo'
            }
        >
            <span className="turn-timer__bar" style={{ transform: `scaleX(${ratio})` }} />
            {enabled ? (
                <span className="turn-timer__text tabular">{Math.ceil(remaining / 1000)} s</span>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------- Deal

interface DealTarget {
    x: number;
    y: number;
}

/** Shuffle the deck in the middle of the table, then deal the cards out to every real pile. */
function DealOverlay({
    state,
    tableRef,
}: {
    state: RedactedMatchState;
    tableRef: RefObject<HTMLDivElement>;
}): JSX.Element {
    const deckRef = useRef<HTMLDivElement>(null);
    const [targets, setTargets] = useState<DealTarget[]>([]);
    const seated = state.players.filter((player) => !player.isSpectator);
    const perPlayer = Math.min(
        6,
        Math.max(
            1,
            Math.floor(
                (state.config.packs * state.config.cardsPerPack) / Math.max(1, seated.length),
            ),
        ),
    );
    const shuffleSeconds = (DEAL_MS * 0.38) / 1000;

    useLayoutEffect(() => {
        const deck = deckRef.current?.getBoundingClientRect();
        if (!deck) return;
        const seatTargets = seated.map((player) => {
            const pile = tableRef.current
                ?.querySelector(`[data-pile-id="${player.id}"]`)
                ?.getBoundingClientRect();
            return pile
                ? {
                      x: pile.left + pile.width / 2 - (deck.left + deck.width / 2),
                      y: pile.top + pile.height / 2 - (deck.top + deck.height / 2),
                  }
                : { x: 0, y: 0 };
        });
        const sequence: DealTarget[] = [];
        for (let round = 0; round < perPlayer; round++) sequence.push(...seatTargets);
        setTargets(sequence);
        // Measured once, when the deal starts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dealWindow = DEAL_MS / 1000 - shuffleSeconds - 0.8;

    return (
        <motion.div
            className="deal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
            <p className="deal__label">Barajando y repartiendo…</p>
            <div className="deal__deck" ref={deckRef}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                    <motion.div
                        key={`shuffle-${index}`}
                        className="deal__card"
                        animate={{
                            x:
                                index % 2 === 0
                                    ? [0, -80, 0, -50, 0, -24, 0]
                                    : [0, 80, 0, 50, 0, 24, 0],
                            rotate:
                                index % 2 === 0
                                    ? [0, -14, 0, -8, 0, -4, 0]
                                    : [0, 14, 0, 8, 0, 4, 0],
                            y: [0, -index * 2, 0],
                        }}
                        transition={{ duration: shuffleSeconds, ease: 'easeInOut' }}
                    >
                        <CardBack size="sm" />
                    </motion.div>
                ))}
                {targets.map((target, index) => (
                    <motion.div
                        key={`deal-${index}`}
                        className="deal__card"
                        initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                        animate={{
                            x: target.x,
                            y: target.y,
                            opacity: [0, 1, 1, 0],
                            scale: 0.5,
                            rotate: (index % 5) * 9 - 18,
                        }}
                        transition={{
                            delay:
                                shuffleSeconds + (index * dealWindow) / Math.max(1, targets.length),
                            duration: 0.75,
                            ease: [0.22, 1, 0.36, 1],
                        }}
                    >
                        <CardBack size="sm" />
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
