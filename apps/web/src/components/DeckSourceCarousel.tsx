import type { DeckSourceDescriptor } from '@kardux/contracts';
import { motion } from 'framer-motion';
import type { JSX } from 'react';
import PlayingCard, { sourceAccent } from './PlayingCard';

interface DeckSourceCarouselProps {
    sources: DeckSourceDescriptor[];
    selected: string[];
    onToggle: (id: string) => void;
}

/**
 * Deck-source picker as a real card carousel - each source shown as an actual synced card
 * (`preview[0]`, live from `tcg-github-sync`), not a name in a checkbox list. Native
 * horizontal scroll + `scroll-snap` gives real momentum/rubber-banding from the browser
 * itself (more reliable than hand-rolled drag physics for a list this simple); the tap/select
 * feedback layer is what carries the apple-design polish.
 */
export default function DeckSourceCarousel({
    sources,
    selected,
    onToggle,
}: DeckSourceCarouselProps): JSX.Element {
    if (sources.length === 0) {
        return (
            <div className="deck-carousel-empty">
                <div className="deck-carousel-skeleton" />
                <div className="deck-carousel-skeleton" />
                <div className="deck-carousel-skeleton" />
                <p className="muted">Cargando mazos reales desde tcg-github-sync…</p>
            </div>
        );
    }

    return (
        <div className="deck-carousel" role="listbox" aria-label="Fuentes de mazo">
            {sources.map((source) => {
                const isSelected = selected.includes(source.id);
                const preview = source.preview[0];
                const accent = sourceAccent(source.id);

                return (
                    <motion.button
                        key={source.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={!source.ready}
                        className={`deck-carousel-item${isSelected ? ' selected' : ''}${!source.ready ? ' disabled' : ''}`}
                        onClick={() => source.ready && onToggle(source.id)}
                        whileTap={source.ready ? { scale: 0.96 } : undefined}
                        animate={{
                            y: isSelected ? -8 : 0,
                            boxShadow: isSelected
                                ? `0 0 0 2px ${accent}, 0 12px 28px rgba(0,0,0,0.45)`
                                : '0 4px 16px rgba(0,0,0,0.25)',
                        }}
                        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                    >
                        <PlayingCard
                            name={preview?.name ?? source.label}
                            imageUrl={preview?.imageUrl}
                            source={source.id}
                            size="md"
                        />
                        <div className="deck-carousel-meta">
                            <span className="deck-carousel-label">{source.label}</span>
                            {source.ready ? (
                                <span className="pill">
                                    {source.cardCount.toLocaleString('es')} cartas
                                </span>
                            ) : (
                                <span className="pill">Próximamente</span>
                            )}
                        </div>
                        {isSelected && (
                            <motion.div
                                layoutId={`deck-carousel-check-${source.id}`}
                                className="deck-carousel-check"
                                style={{ background: accent }}
                            >
                                ✓
                            </motion.div>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
}
