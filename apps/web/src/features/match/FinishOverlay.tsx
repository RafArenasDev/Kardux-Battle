import type { MatchFinishedPayload, RedactedMatchState } from '@kardux/contracts';
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';
import { BrandLogo } from '../../components/brand/Brand';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';

interface FinishOverlayProps {
    state: RedactedMatchState;
    finished: MatchFinishedPayload;
    onHome: () => void;
    onPlayAgain: () => void;
}

const CONFETTI_COLORS = ['#f0c96b', '#ffe3a0', '#3fd6a4', '#6fd2ff', '#ff6f91', '#c28bff'];

export function FinishOverlay({
    state,
    finished,
    onHome,
    onPlayAgain,
}: FinishOverlayProps): JSX.Element {
    const reduceMotion = useReducedMotion();
    const winner = finished.standings.find((player) => player.id === finished.winnerId);
    const iWon = finished.winnerId === state.yourId;
    const title = finished.isDraw
        ? '¡Empate!'
        : iWon
          ? '¡Victoria!'
          : `Gana ${winner?.nickname ?? '…'}`;

    return (
        <motion.div
            className="finish"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            {iWon && !reduceMotion ? (
                <div className="confetti" aria-hidden>
                    {Array.from({ length: 44 }, (_, index) => (
                        <motion.span
                            key={index}
                            style={{
                                left: `${(index * 37) % 100}%`,
                                background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                            }}
                            initial={{ y: '-10vh', rotate: 0, opacity: 1 }}
                            animate={{ y: '110vh', rotate: 360 + index * 20, opacity: [1, 1, 0.6] }}
                            transition={{
                                duration: 2.4 + (index % 7) * 0.25,
                                delay: (index % 11) * 0.08,
                                ease: 'easeIn',
                            }}
                        />
                    ))}
                </div>
            ) : null}

            <motion.div
                className="finish__card panel panel--pad"
                initial={{ scale: 0.85, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', bounce: 0.35, duration: 0.7 }}
            >
                <BrandLogo className="finish__logo" />
                <h1 id="finish-title" className={iWon ? 'gold' : ''}>
                    {title}
                </h1>
                <p className="text-2">
                    {finished.isDraw
                        ? 'Nadie se llevó la mesa esta vez.'
                        : iWon
                          ? 'Te llevaste la mesa. ¡Bien jugado!'
                          : 'Buena partida. La revancha te espera.'}
                </p>

                <ol className="finish__standings">
                    {finished.standings.map((player, index) => (
                        <motion.li
                            key={player.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + index * 0.1 }}
                            className={player.id === state.yourId ? 'is-you' : ''}
                        >
                            <span className="standings__rank">{index + 1}</span>
                            <Avatar seed={player.avatarSeed} size={36} />
                            <span className="standings__name">{player.nickname}</span>
                            <span className="standings__count tabular">
                                {player.cardCount} cartas
                            </span>
                        </motion.li>
                    ))}
                </ol>

                <div className="finish__actions">
                    <Button variant="gold" size="lg" icon="lightning-helix" onClick={onPlayAgain}>
                        Otra partida rápida
                    </Button>
                    <Button variant="ghost" icon="return-arrow" onClick={onHome}>
                        Volver al inicio
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
}
