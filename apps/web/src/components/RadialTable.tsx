import type { Card, MatchPhase, Player, PublicRoundView } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';
import PlayingCard from './PlayingCard';

interface RadialTableProps {
    phase: MatchPhase;
    players: Player[];
    selfId: string;
    yourTopCard: Card | null;
    round: PublicRoundView | null;
    potSize: number;
    winnerIdThisRound?: string | null;
    onSelectAttribute: (key: string) => void;
    onPlayCard: () => void;
}

/**
 * The live match table - CLAUDE.md's "mesa radial": local player anchored bottom-center with
 * an enlarged card, rivals fanned along an elliptical arc above, pot in the middle. Renders
 * from `RedactedMatchState` + the current `PublicRoundView`/`round:revealed` payload only -
 * never shown a card it isn't allowed to see.
 */
export default function RadialTable({
    phase,
    players,
    selfId,
    yourTopCard,
    round,
    potSize,
    winnerIdThisRound,
    onSelectAttribute,
    onPlayCard,
}: RadialTableProps): JSX.Element {
    const rivals = players.filter((p) => p.id !== selfId);
    const isLeader = round?.leaderId === selfId;
    const hasPlayed = round?.playedBy.includes(selfId) ?? false;
    const revealing = phase === 'REVEAL' || phase === 'RESOLVE' || phase === 'TIE_POT';

    return (
        <div className="radial-table">
            <div className="rivals-arc">
                {rivals.map((rival, index) => (
                    <RivalSeat
                        key={rival.id}
                        rival={rival}
                        index={index}
                        total={rivals.length}
                        played={round?.playedBy.includes(rival.id) ?? false}
                        revealedCard={round?.revealedCards[rival.id]}
                        revealing={revealing}
                        isWinner={winnerIdThisRound === rival.id}
                        isLeader={round?.leaderId === rival.id}
                    />
                ))}
            </div>

            <div className="table-pot">
                <AnimatePresence>
                    {potSize > 0 && (
                        <motion.div
                            key="pot-stack"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.4, opacity: 0, y: -10 }}
                            className="pot-badge"
                        >
                            POZO ×{potSize}
                        </motion.div>
                    )}
                </AnimatePresence>
                {round?.attribute && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="pot-attribute pill"
                    >
                        Atributo: <strong>{round.attribute}</strong>
                    </motion.div>
                )}
            </div>

            <div className="local-seat">
                {yourTopCard ? (
                    <motion.div layoutId={`card-${yourTopCard.code}`}>
                        <PlayingCard
                            layoutId={`card-${yourTopCard.code}`}
                            name={yourTopCard.name}
                            imageUrl={yourTopCard.imageUrl}
                            source={yourTopCard.source}
                            stats={yourTopCard.stats}
                            activeStat={round?.attribute}
                            size="lg"
                            winner={winnerIdThisRound === selfId}
                            onSelectStat={
                                phase === 'AWAITING_ATTRIBUTE' && isLeader
                                    ? onSelectAttribute
                                    : undefined
                            }
                        />
                    </motion.div>
                ) : (
                    <p className="muted">Sin carta en juego.</p>
                )}

                {phase === 'AWAITING_ATTRIBUTE' && isLeader && (
                    <p className="local-hint">
                        Elige un atributo de tu carta para retar a la mesa.
                    </p>
                )}
                {phase === 'AWAITING_ATTRIBUTE' && !isLeader && (
                    <p className="local-hint muted">
                        {players.find((p) => p.id === round?.leaderId)?.nickname ?? 'El líder'} está
                        eligiendo atributo…
                    </p>
                )}
                {phase === 'AWAITING_CARDS' && !hasPlayed && (
                    <button className="primary" onClick={onPlayCard}>
                        Jugar carta
                    </button>
                )}
                {phase === 'AWAITING_CARDS' && hasPlayed && (
                    <p className="local-hint muted">Esperando al resto de la mesa…</p>
                )}
            </div>
        </div>
    );
}

function RivalSeat({
    rival,
    index,
    total,
    played,
    revealedCard,
    revealing,
    isWinner,
    isLeader,
}: {
    rival: Player;
    index: number;
    total: number;
    played: boolean;
    revealedCard?: Card;
    revealing: boolean;
    isWinner: boolean;
    isLeader: boolean;
}): JSX.Element {
    // Elliptical arc: middle seats sit higher/further back, edges curve down toward the
    // player - a symmetric fan across a 140deg span regardless of seat count.
    const t = total > 1 ? index / (total - 1) - 0.5 : 0;
    const angle = t * 140 * (Math.PI / 180);
    const radiusX = 46;
    const bow = 26;
    const left = 50 + Math.sin(angle) * radiusX;
    const top = bow * (1 - Math.cos(angle));

    return (
        <motion.div
            className={`rival-seat${rival.isEliminated ? ' eliminated' : ''}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            layout
            animate={{
                opacity: rival.isEliminated ? 0.5 : 1,
                scale: rival.isEliminated ? 0.82 : 1,
            }}
        >
            <div className="rival-slot">
                {revealing && revealedCard ? (
                    <PlayingCard
                        name={revealedCard.name}
                        imageUrl={revealedCard.imageUrl}
                        source={revealedCard.source}
                        size="sm"
                        winner={isWinner}
                    />
                ) : (
                    <motion.div
                        className={`rival-card-back${played ? ' played' : ''}`}
                        initial={false}
                        animate={{ y: played ? -6 : 0 }}
                    />
                )}
            </div>
            <div className="rival-info">
                <img
                    className="avatar"
                    src={`https://api.dicebear.com/9.x/identicon/svg?seed=${rival.avatarSeed}`}
                    alt=""
                />
                <div className="rival-meta">
                    <span className="rival-name">
                        {rival.nickname}
                        {isLeader && ' 👑'}
                    </span>
                    <span className="faint">{rival.cardCount} cartas</span>
                </div>
            </div>
        </motion.div>
    );
}
