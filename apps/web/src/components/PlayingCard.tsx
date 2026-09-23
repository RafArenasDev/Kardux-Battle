import type { DeckSourceId } from '@kardux/contracts';
import { AnimatePresence, motion } from 'framer-motion';
import type { JSX } from 'react';

/** Jewel-tone accent per deck source, pulled from the fanned cards in `logo.png` (ember,
 *  ice, teal, amethyst, steel) - lets a rival's face-down card or a deck-picker card hint at
 *  its universe before any card art has loaded. */
const SOURCE_ACCENT: Record<string, string> = {
    pokeapi: 'var(--ember)',
    apitcg: 'var(--ember)',
    deckofcards: 'var(--steel)',
    dragonball: 'var(--ember)',
    naruto: 'var(--amethyst)',
    digimon: 'var(--teal)',
    rickmorty: 'var(--teal)',
    swapi: 'var(--ice)',
    superheroes: 'var(--amethyst)',
    marvel: 'var(--ember)',
    transformers: 'var(--steel)',
    local: 'var(--gold)',
};

export function sourceAccent(source: string): string {
    return SOURCE_ACCENT[source] ?? 'var(--gold)';
}

interface PlayingCardProps {
    name: string;
    imageUrl?: string;
    source?: DeckSourceId | string;
    stats?: Record<string, number>;
    /** Highlighted stat key, shown pulsing/enlarged (the round's chosen attribute). */
    activeStat?: string;
    size?: 'sm' | 'md' | 'lg';
    faceDown?: boolean;
    winner?: boolean;
    loser?: boolean;
    onSelectStat?: (key: string) => void;
    disabled?: boolean;
    layoutId?: string;
}

const SIZES: Record<NonNullable<PlayingCardProps['size']>, { w: number; h: number }> = {
    sm: { w: 76, h: 106 },
    md: { w: 128, h: 178 },
    lg: { w: 200, h: 278 },
};

/**
 * A single card face - used for the local hand, the pot, rival piles (face-down), and the
 * deck-source carousel. Front/back share one `layoutId`-capable component so a card can fly
 * and flip between contexts (mano -> pozo, mazo -> mano) without a hard cut.
 */
export default function PlayingCard({
    name,
    imageUrl,
    source,
    stats,
    activeStat,
    size = 'md',
    faceDown = false,
    winner = false,
    loser = false,
    onSelectStat,
    disabled = false,
    layoutId,
}: PlayingCardProps): JSX.Element {
    const dims = SIZES[size];
    const accent = source ? sourceAccent(source) : 'var(--gold)';

    return (
        <motion.div
            layoutId={layoutId}
            className="pcard-flip"
            style={{ width: dims.w, height: dims.h }}
            animate={{ rotateY: faceDown ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
            <div
                className="pcard-face pcard-front"
                style={{
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CSS custom prop, not typed by React.CSSProperties
                    ['--accent' as any]: accent,
                    boxShadow: winner
                        ? '0 0 0 2px var(--gold-bright), 0 0 24px rgba(244, 207, 126, 0.5)'
                        : undefined,
                    filter: loser ? 'saturate(0.35) brightness(0.8)' : undefined,
                }}
            >
                <div className="pcard-art">
                    {imageUrl ? (
                        <img src={imageUrl} alt={name} loading="lazy" />
                    ) : (
                        <div className="pcard-art-placeholder" />
                    )}
                </div>
                <div className="pcard-body">
                    <div className="pcard-name" title={name}>
                        {name}
                    </div>
                    {stats && size !== 'sm' && (
                        <div className="pcard-stats">
                            <AnimatePresence initial={false}>
                                {Object.entries(stats).map(([key, value]) => (
                                    <motion.button
                                        key={key}
                                        type="button"
                                        layout
                                        className={`pcard-stat${activeStat === key ? ' active' : ''}`}
                                        disabled={disabled || !onSelectStat}
                                        onClick={() => onSelectStat?.(key)}
                                        animate={{
                                            opacity: activeStat && activeStat !== key ? 0.4 : 1,
                                            scale: activeStat === key ? 1.05 : 1,
                                        }}
                                        whileTap={onSelectStat ? { scale: 0.95 } : undefined}
                                    >
                                        <span className="pcard-stat-key">{key}</span>
                                        <StatCounter value={value} />
                                    </motion.button>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
            <div className="pcard-face pcard-back">
                <div className="pcard-back-emblem">K</div>
            </div>
        </motion.div>
    );
}

function StatCounter({ value }: { value: number }): JSX.Element {
    return (
        <motion.span
            key={value}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="pcard-stat-value"
        >
            {value}
        </motion.span>
    );
}
