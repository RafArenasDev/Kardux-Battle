import type { Card } from '@kardux/contracts';
import { motion } from 'framer-motion';
import type { CSSProperties, JSX } from 'react';
import { attributeMeta, deckOf, formatStat } from '../../lib/deck-meta';
import { Icon } from '../ui/Icon';
import { crestUrl } from '../brand/Brand';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/i18n';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';
export type CardOutcome = 'win' | 'lose' | 'tie' | null;

interface PlayingCardProps {
    card: Card;
    size?: CardSize;
    /** Attribute chosen for the round - its row glows, the rest dim. */
    selectedAttribute?: string | null;
    /** When set, stat rows are buttons (only for the leader choosing an attribute). */
    onSelectAttribute?: (key: string) => void;
    outcome?: CardOutcome;
    className?: string;
    style?: CSSProperties;
}

export function PlayingCard({
    card,
    size = 'md',
    selectedAttribute = null,
    onSelectAttribute,
    outcome = null,
    className,
    style,
}: PlayingCardProps): JSX.Element {
    const { t } = useTranslation();
    const { l, locale } = useLocale();
    const deck = deckOf(card.source);
    const interactive = Boolean(onSelectAttribute);
    const accent = deck?.accent ?? 'var(--gold-400)';
    const name = locale === 'en' && card.nameEn ? card.nameEn : card.name;

    return (
        <div
            className={['pcard', `pcard--${size}`, outcome && `pcard--${outcome}`, className]
                .filter(Boolean)
                .join(' ')}
            style={{ ['--accent' as string]: accent, ...style }}
        >
            <div className="pcard__head">
                <span className="pcard__code">{card.code}</span>
                <span className="pcard__name">{name}</span>
                {deck ? <Icon name={deck.coverIcon} className="pcard__deck-icon" /> : null}
            </div>

            <div className="pcard__art">
                <img src={card.imageUrl} alt={name} loading="lazy" draggable={false} />
            </div>

            <ul
                className="pcard__stats"
                role={interactive ? 'listbox' : undefined}
                aria-label={t('table.attributes')}
            >
                {Object.entries(card.stats).map(([key, value]) => {
                    const meta = attributeMeta(card.source, key);
                    const selected = selectedAttribute === key;
                    const dimmed = selectedAttribute !== null && !selected;
                    const content = (
                        <>
                            <Icon name={meta.icon} className="pcard__stat-icon" />
                            <span className="pcard__stat-label">{l(meta.label)}</span>
                            <span className="pcard__stat-value tabular">
                                {formatStat(value, meta.unit)}
                            </span>
                        </>
                    );

                    return (
                        <li
                            key={key}
                            className={[
                                'pcard__stat',
                                selected && 'is-selected',
                                dimmed && 'is-dimmed',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            {interactive ? (
                                <motion.button
                                    type="button"
                                    className="pcard__stat-btn"
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => onSelectAttribute?.(key)}
                                    aria-label={t('table.playWith', {
                                        attribute: l(meta.label),
                                        value: formatStat(value, meta.unit),
                                    })}
                                >
                                    {content}
                                </motion.button>
                            ) : (
                                <div className="pcard__stat-btn">{content}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

interface CardBackProps {
    size?: CardSize;
    className?: string;
    style?: CSSProperties;
    count?: number;
}

/** The Kardux card back: obsidian weave, gold frame and the crest. */
export function CardBack({ size = 'md', className, style, count }: CardBackProps): JSX.Element {
    const { t } = useTranslation();
    return (
        <div
            className={['pcard-back', `pcard--${size}`, className].filter(Boolean).join(' ')}
            style={style}
            aria-hidden={count === undefined}
        >
            <div className="pcard-back__frame">
                <img src={crestUrl} alt="" draggable={false} />
            </div>
            {count !== undefined ? (
                <span
                    className="pcard-back__count tabular"
                    aria-label={t('common.cards', { count })}
                >
                    {count}
                </span>
            ) : null}
        </div>
    );
}
