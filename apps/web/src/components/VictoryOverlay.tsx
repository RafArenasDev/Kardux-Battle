import type { MatchFinishedPayload } from '@kardux/contracts';
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';
import { useMemo } from 'react';

const CONFETTI_COLORS = ['#d9ac53', '#f4cf7e', '#5ec8f2', '#35d9c4', '#b579ea', '#ff7d47'];

interface VictoryOverlayProps {
    result: MatchFinishedPayload;
    selfId: string;
    onClose: () => void;
}

/** `match:finished` - confetti + shield + cascading final standings, CLAUDE.md's "Victoria"
 *  animation row. Confetti is a lightweight particle burst (randomized fall trajectories via
 *  framer-motion), not a third-party library - this project has no confetti dependency and
 *  one wasn't worth adding for a single moment. */
export default function VictoryOverlay({
    result,
    selfId,
    onClose,
}: VictoryOverlayProps): JSX.Element {
    const reduceMotion = useReducedMotion();
    const won = result.winnerId === selfId;

    const particles = useMemo(
        () =>
            reduceMotion
                ? []
                : Array.from({ length: 60 }, (_, i) => ({
                      id: i,
                      x: Math.random() * 100,
                      delay: Math.random() * 0.6,
                      duration: 2.2 + Math.random() * 1.4,
                      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                      rotate: Math.random() * 360,
                      drift: (Math.random() - 0.5) * 120,
                  })),
        [reduceMotion],
    );

    return (
        <motion.div
            className="victory-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            {particles.map((p) => (
                <motion.span
                    key={p.id}
                    className="confetti-piece"
                    style={{ left: `${p.x}%`, background: p.color }}
                    initial={{ y: -20, opacity: 0, rotate: 0 }}
                    animate={{ y: '110vh', opacity: [0, 1, 1, 0], x: p.drift, rotate: p.rotate }}
                    transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
                />
            ))}

            <motion.div
                initial={{ scale: 0.7, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}
                className="victory-card card"
            >
                <img src="/logo.png" alt="" className="victory-emblem" />
                <h2 className="brand-title">
                    {result.isDraw ? 'Empate' : won ? '¡Victoria!' : 'Partida terminada'}
                </h2>
                <p className="muted">
                    {result.isDraw
                        ? 'Nadie se llevó toda la mesa.'
                        : won
                          ? 'Te llevaste toda la mesa.'
                          : 'Gana ' +
                            (result.standings.find((s) => s.id === result.winnerId)?.nickname ??
                                '—')}
                </p>

                <ol className="standings-list">
                    {[...result.standings]
                        .sort((a, b) => b.cardCount - a.cardCount)
                        .map((player, index) => (
                            <motion.li
                                key={player.id}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + index * 0.08 }}
                                className={player.id === selfId ? 'self' : undefined}
                            >
                                <span className="standings-rank">#{index + 1}</span>
                                <img
                                    className="avatar"
                                    src={`https://api.dicebear.com/9.x/identicon/svg?seed=${player.avatarSeed}`}
                                    alt=""
                                />
                                <span className="standings-name">{player.nickname}</span>
                                <span className="faint">{player.cardCount} cartas</span>
                            </motion.li>
                        ))}
                </ol>

                <button className="primary" onClick={onClose}>
                    Volver al lobby
                </button>
            </motion.div>
        </motion.div>
    );
}
