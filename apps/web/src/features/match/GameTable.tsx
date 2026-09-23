import type { Card, Player, RedactedMatchState } from '@kardux/contracts';
import type { PanInfo } from 'framer-motion';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';
import { CardBack, PlayingCard } from '../../components/cards/PlayingCard';
import type { CardOutcome, CardSize } from '../../components/cards/PlayingCard';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
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
    onPlayCard: () => void;
}

const throwSpring = { type: 'spring', stiffness: 260, damping: 26 } as const;

/** Who must act right now: the leader while choosing, otherwise nobody specific. */
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
    onPlayCard,
}: GameTableProps): JSX.Element {
    const me = state.players.find((player) => player.id === state.yourId);
    const opponents = state.players.filter(
        (player) => player.id !== state.yourId && !player.isSpectator,
    );
    const leaderId = currentLeaderId(state);
    const busy = reveal !== null || dealing;
    const iAmLeader = leaderId === state.yourId;
    const playedBy = state.round?.playedBy ?? [];
    const mustPlay =
        state.phase === 'AWAITING_CARDS' &&
        (state.round?.playOrder.includes(state.yourId) ?? false) &&
        !playedBy.includes(state.yourId);

    return (
        <div className={`table table--${breakpoint}`}>
            <div className="table__felt" aria-hidden />

            <OpponentRow
                state={state}
                opponents={opponents}
                leaderId={leaderId}
                reveal={reveal}
                breakpoint={breakpoint}
            />

            <CenterStage
                state={state}
                reveal={reveal}
                myPlayedCard={myPlayedCard}
                leaderId={leaderId}
                breakpoint={breakpoint}
            />

            <MyZone
                state={state}
                me={me}
                busy={busy}
                iAmLeader={iAmLeader}
                mustPlay={mustPlay}
                breakpoint={breakpoint}
                onSelectAttribute={onSelectAttribute}
                onPlayCard={onPlayCard}
            />

            <AnimatePresence>
                {dealing ? <DealOverlay state={state} key="deal" /> : null}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------- Opponents

function OpponentRow({
    state,
    opponents,
    leaderId,
    reveal,
    breakpoint,
}: {
    state: RedactedMatchState;
    opponents: Player[];
    leaderId: string | null;
    reveal: RevealState | null;
    breakpoint: Breakpoint;
}): JSX.Element {
    const mid = (opponents.length - 1) / 2;

    return (
        <ul className="opponents" aria-label="Rivales">
            {opponents.map((player, index) => {
                // Gentle arc: seats further from the middle sit lower, like around a table.
                const t = mid === 0 ? 0 : (index - mid) / mid;
                const arcY = breakpoint === 'mobile' ? 0 : t * t * 26;
                return (
                    <motion.li
                        key={player.id}
                        className="opponent"
                        style={{ y: arcY }}
                        layout
                        animate={
                            player.isEliminated
                                ? { opacity: 0.45, scale: 0.9, filter: 'grayscale(1)' }
                                : { opacity: 1, scale: 1, filter: 'grayscale(0)' }
                        }
                    >
                        <OpponentSeat
                            state={state}
                            player={player}
                            isLeader={leaderId === player.id}
                            revealCard={reveal?.cards[player.id] ?? null}
                        />
                    </motion.li>
                );
            })}
        </ul>
    );
}

function OpponentSeat({
    state,
    player,
    isLeader,
    revealCard,
}: {
    state: RedactedMatchState;
    player: Player;
    isLeader: boolean;
    revealCard: Card | null;
}): JSX.Element {
    const played = state.round?.playedBy.includes(player.id) ?? false;
    const waitingOn =
        state.phase === 'AWAITING_CARDS' &&
        (state.round?.playOrder.includes(player.id) ?? false) &&
        !played;

    const status = player.isEliminated
        ? 'Eliminado'
        : state.phase === 'AWAITING_ATTRIBUTE' && isLeader
          ? 'Eligiendo…'
          : state.phase === 'AWAITING_CARDS'
            ? played
                ? 'Carta lista'
                : 'Pensando…'
            : isLeader
              ? 'Líder'
              : '';

    return (
        <div className={`seat ${isLeader ? 'seat--leader' : ''}`}>
            <div className="seat__avatar">
                <Avatar
                    seed={player.avatarSeed}
                    size={52}
                    active={isLeader || waitingOn}
                    label={player.nickname}
                />
                {isLeader ? (
                    <span className="seat__crown" aria-label="Líder de la ronda">
                        <Icon name="crown" />
                    </span>
                ) : null}
            </div>
            <div className="seat__info">
                <strong className="seat__name">{player.nickname}</strong>
                <span className="seat__status">{status || ' '}</span>
            </div>
            <div className="seat__pile" aria-label={`${player.cardCount} cartas`}>
                <CardBack size="xs" count={player.cardCount} />
            </div>
            {revealCard ? <span className="sr-only">Jugó {revealCard.name}</span> : null}
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
}: {
    state: RedactedMatchState;
    reveal: RevealState | null;
    myPlayedCard: Card | null;
    leaderId: string | null;
    breakpoint: Breakpoint;
}): JSX.Element {
    const reduceMotion = useReducedMotion();
    const playersById = new Map(state.players.map((player) => [player.id, player]));
    const cardSize: CardSize =
        breakpoint === 'mobile' ? 'xs' : breakpoint === 'tablet' ? 'sm' : 'md';
    const leader = leaderId ? playersById.get(leaderId) : undefined;
    const attributeKey = reveal?.attribute || state.round?.attribute || null;
    const source = state.config.deckSources[0] ?? 'pokeapi';
    const attribute = attributeKey ? attributeMeta(source, attributeKey) : null;

    // Slots, in play order. During a reveal they come from the revealed cards themselves.
    const slotIds = reveal
        ? Object.keys(reveal.cards)
        : state.phase === 'AWAITING_CARDS'
          ? (state.round?.playOrder ?? [])
          : [];

    const winnerId = reveal?.result?.winnerId ?? null;
    const isTie = reveal?.result?.isTie ?? false;

    let banner: JSX.Element;
    if (reveal?.result) {
        const winner = winnerId ? playersById.get(winnerId) : undefined;
        banner = isTie ? (
            <motion.div
                className="banner banner--tie"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
            >
                ¡Empate! Las cartas quedan en el pozo
            </motion.div>
        ) : (
            <motion.div
                className={`banner ${winnerId === state.yourId ? 'banner--win' : 'banner--lose'}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.45, duration: 0.6 }}
            >
                {winnerId === state.yourId ? '¡Ganas la ronda!' : `Gana ${winner?.nickname ?? '…'}`}
                <span className="banner__sub">+{reveal.result.potSize} cartas</span>
            </motion.div>
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
            <div className="center__cards">
                <AnimatePresence mode="popLayout">
                    {slotIds.map((playerId, index) => {
                        const player = playersById.get(playerId);
                        const revealed = reveal?.cards[playerId];
                        const played = state.round?.playedBy.includes(playerId) ?? false;
                        const outcome: CardOutcome = reveal?.result
                            ? isTie
                                ? 'tie'
                                : playerId === winnerId
                                  ? 'win'
                                  : 'lose'
                            : null;
                        const tilt = reduceMotion ? 0 : (index - (slotIds.length - 1) / 2) * 4;
                        const isMine = playerId === state.yourId;

                        return (
                            <motion.div
                                key={playerId}
                                className="center__slot"
                                layout
                                initial={{ opacity: 0, y: isMine ? 120 : -120, rotate: tilt * 2 }}
                                animate={{
                                    opacity: 1,
                                    y: 0,
                                    rotate: tilt,
                                    scale: outcome === 'win' ? 1.08 : 1,
                                }}
                                exit={{ opacity: 0, scale: 0.6, y: outcome === 'win' ? -40 : 40 }}
                                transition={throwSpring}
                            >
                                {revealed ? (
                                    <FlipCard
                                        card={revealed}
                                        size={cardSize}
                                        outcome={outcome}
                                        attribute={attributeKey}
                                        delay={index * 0.08}
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
                                        <span className="spinner" />
                                    </div>
                                )}
                                <span className="center__owner">
                                    {player ? <Avatar seed={player.avatarSeed} size={22} /> : null}
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
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                {slotIds.length === 0 ? <PotStack potSize={state.potSize} /> : null}
            </div>
            {state.potSize > 0 && slotIds.length > 0 ? (
                <span className="badge pot-badge">Pozo ×{state.potSize}</span>
            ) : null}
        </section>
    );
}

function PotStack({ potSize }: { potSize: number }): JSX.Element {
    if (potSize === 0) {
        return (
            <div className="center__empty">
                <Icon name="sword-clash" />
            </div>
        );
    }
    return (
        <motion.div
            className="pot"
            animate={{ rotate: [0, -1.5, 1.5, 0] }}
            transition={{ duration: 0.5, repeat: 2 }}
        >
            {Array.from({ length: Math.min(potSize, 5) }, (_, index) => (
                <CardBack
                    key={index}
                    size="sm"
                    style={{ position: 'absolute', transform: `rotate(${(index - 2) * 7}deg)` }}
                />
            ))}
            <span className="badge pot-badge">Pozo ×{potSize}</span>
        </motion.div>
    );
}

/** Face-down → face-up 3D flip (rotateY), staggered per seat. */
function FlipCard({
    card,
    size,
    outcome,
    attribute,
    delay,
}: {
    card: Card;
    size: CardSize;
    outcome: CardOutcome;
    attribute: string | null;
    delay: number;
}): JSX.Element {
    return (
        <div className={`flip pcard--${size}`}>
            <motion.div
                className="flip__inner"
                initial={{ rotateY: 180 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
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
    iAmLeader,
    mustPlay,
    breakpoint,
    onSelectAttribute,
    onPlayCard,
}: {
    state: RedactedMatchState;
    me: Player | undefined;
    busy: boolean;
    iAmLeader: boolean;
    mustPlay: boolean;
    breakpoint: Breakpoint;
    onSelectAttribute: (attribute: string) => void;
    onPlayCard: () => void;
}): JSX.Element {
    const reduceMotion = useReducedMotion();
    const card = state.yourTopCard;
    const choosing = state.phase === 'AWAITING_ATTRIBUTE' && iAmLeader && !busy;
    const canThrow = mustPlay && !busy;

    function handleDragEnd(_: unknown, info: PanInfo): void {
        // Project the flick: a fast upward throw counts even if it's short.
        if (info.offset.y < -90 || info.velocity.y < -600) onPlayCard();
    }

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
        <section
            className={`my-zone ${choosing || canThrow ? 'my-zone--active' : ''}`}
            aria-label="Tu mano"
        >
            <TurnTimer state={state} active={choosing || canThrow} />

            <div className="my-zone__cards">
                <div className="my-zone__pile" aria-label={`${me.cardCount} cartas en tu pila`}>
                    <CardBack size={breakpoint === 'mobile' ? 'xs' : 'sm'} count={me.cardCount} />
                    <span className="text-3">Tu pila</span>
                </div>

                <AnimatePresence mode="popLayout">
                    {card && !busy && !(state.phase === 'AWAITING_CARDS' && !mustPlay) ? (
                        <motion.div
                            key={card.code}
                            className={`my-card ${canThrow ? 'my-card--throwable' : ''}`}
                            initial={{ opacity: 0, y: 60, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{
                                opacity: 0,
                                y: reduceMotion ? 0 : -220,
                                scale: 0.7,
                                rotate: -6,
                            }}
                            transition={throwSpring}
                            drag={canThrow ? 'y' : false}
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={{ top: 0.9, bottom: 0.1 }}
                            onDragEnd={canThrow ? handleDragEnd : undefined}
                            whileDrag={{ scale: 1.04, rotate: -2 }}
                        >
                            <PlayingCard
                                card={card}
                                size="lg"
                                {...(choosing ? { onSelectAttribute } : {})}
                                selectedAttribute={
                                    state.phase === 'AWAITING_CARDS'
                                        ? (state.round?.attribute ?? null)
                                        : null
                                }
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
                            <CardBack size="lg" />
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="my-zone__hint">
                    {choosing ? (
                        <p className="gold">Toca el atributo más fuerte de tu carta.</p>
                    ) : canThrow ? (
                        <>
                            <p className="gold">Arrastra tu carta hacia arriba o toca el botón.</p>
                            <Button variant="gold" size="lg" icon="card-play" onClick={onPlayCard}>
                                Lanzar carta
                            </Button>
                        </>
                    ) : state.phase === 'AWAITING_CARDS' ? (
                        <p className="text-2">Esperando a los demás…</p>
                    ) : (
                        <p className="text-2">Espera tu turno.</p>
                    )}
                </div>
            </div>
        </section>
    );
}

function TurnTimer({
    state,
    active,
}: {
    state: RedactedMatchState;
    active: boolean;
}): JSX.Element | null {
    const now = useNow(200, state.turnDeadline !== null);
    if (!state.turnDeadline || state.config.turnTimeoutMs === 0) return null;
    const remaining = Math.max(0, state.turnDeadline - now);
    const ratio = Math.min(1, remaining / state.config.turnTimeoutMs);
    const urgent = remaining < 6_000;

    return (
        <div
            className={`turn-timer ${active ? 'turn-timer--active' : ''} ${urgent ? 'turn-timer--urgent' : ''}`}
            role="timer"
            aria-label={`${Math.ceil(remaining / 1000)} segundos para jugar`}
        >
            <span className="turn-timer__bar" style={{ transform: `scaleX(${ratio})` }} />
            <span className="turn-timer__text tabular">{Math.ceil(remaining / 1000)} s</span>
        </div>
    );
}

// ---------------------------------------------------------------- Deal

/** Shuffle the deck in the middle of the table, then deal cards out to every seat. */
function DealOverlay({ state }: { state: RedactedMatchState }): JSX.Element {
    const reduceMotion = useReducedMotion();
    const seated = state.players.filter((player) => !player.isSpectator);
    const opponents = seated.filter((player) => player.id !== state.yourId);
    const perPlayer = Math.min(
        6,
        Math.max(
            1,
            Math.floor(
                (state.config.packs * state.config.cardsPerPack) / Math.max(1, seated.length),
            ),
        ),
    );
    const shuffleEnd = (DEAL_MS * 0.4) / 1000;

    const targets: { x: string; y: string }[] = [];
    for (let round = 0; round < perPlayer; round++) {
        targets.push({ x: '0vw', y: '38vh' });
        opponents.forEach((_, index) => {
            const spread = opponents.length === 1 ? 0 : (index / (opponents.length - 1) - 0.5) * 70;
            targets.push({ x: `${spread}vw`, y: '-34vh' });
        });
    }

    return (
        <motion.div
            className="deal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-live="assertive"
        >
            <p className="deal__label">Barajando y repartiendo…</p>
            <div className="deal__deck">
                {!reduceMotion
                    ? [0, 1, 2, 3, 4, 5].map((index) => (
                          <motion.div
                              key={`shuffle-${index}`}
                              className="deal__card"
                              animate={{
                                  x: index % 2 === 0 ? [0, -70, 0, -40, 0] : [0, 70, 0, 40, 0],
                                  rotate: index % 2 === 0 ? [0, -12, 0, -6, 0] : [0, 12, 0, 6, 0],
                                  y: [0, -index * 2, 0],
                              }}
                              transition={{ duration: shuffleEnd, ease: 'easeInOut' }}
                          >
                              <CardBack size="sm" />
                          </motion.div>
                      ))
                    : null}
                {targets.map((target, index) => (
                    <motion.div
                        key={`deal-${index}`}
                        className="deal__card"
                        initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                        animate={{
                            x: target.x,
                            y: target.y,
                            opacity: [0, 1, 1, 0],
                            scale: 0.7,
                            rotate: (index % 5) * 7 - 14,
                        }}
                        transition={{
                            delay:
                                shuffleEnd +
                                index * ((DEAL_MS / 1000 - shuffleEnd - 0.5) / targets.length),
                            duration: 0.5,
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
