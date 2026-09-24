import type { DeckSourceId } from '@kardux/contracts';
import type { DeckAttribute, DeckInfo } from '@kardux/content';
import { getDeckInfo } from '@kardux/content';
import { formatNumber } from './format';

export function deckOf(source: DeckSourceId): DeckInfo | undefined {
    return getDeckInfo(source);
}

/** Label/unit/icon for an attribute key, falling back to the raw key. */
export function attributeMeta(source: DeckSourceId, key: string): DeckAttribute {
    const found = getDeckInfo(source)?.attributes.find((attribute) => attribute.key === key);
    return found ?? { key, label: { es: key, en: key }, icon: 'card-play', higherIsBetter: true };
}

export function formatStat(value: number, unit?: string): string {
    const formatted = formatNumber(value, 3);
    if (!unit) return formatted;
    return unit.startsWith('/') ? `${formatted}${unit}` : `${formatted} ${unit}`;
}
