import type { PlayingCard } from './cards.js';
import { rankValue } from './cards.js';

/** Poker hand categories, lowest to highest. */
export const HAND_CATEGORIES = [
    'high-card',
    'pair',
    'two-pair',
    'three-of-a-kind',
    'straight',
    'flush',
    'full-house',
    'four-of-a-kind',
    'straight-flush',
    'royal-flush',
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];

export interface HandRank {
    category: HandCategory;
    /** Category first, then tie-breakers (kickers) - compare element by element. */
    score: number[];
    /** The five cards that make the hand. */
    cards: PlayingCard[];
}

/** Negative when `a` loses, positive when `a` wins, 0 on a split pot. */
export function compareHands(a: HandRank, b: HandRank): number {
    for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) {
        const diff = (a.score[i] ?? 0) - (b.score[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/** Highest card of a straight in `values` (distinct, descending), or 0. Ace can play low. */
function straightHigh(values: number[]): number {
    const set = new Set(values);
    if (set.has(14)) set.add(1);
    for (let high = 14; high >= 5; high--) {
        let run = true;
        for (let v = high; v > high - 5; v--) {
            if (!set.has(v)) {
                run = false;
                break;
            }
        }
        if (run) return high;
    }
    return 0;
}

/** Ranks exactly five cards. */
export function rankFive(cards: PlayingCard[]): HandRank {
    const values = cards.map((card) => rankValue(card.rank)).sort((a, b) => b - a);
    const flush = cards.every((card) => card.suit === cards[0]!.suit);
    const distinct = [...new Set(values)];
    const straight = distinct.length === 5 ? straightHigh(distinct) : 0;

    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    // Groups sorted by size, then by value: e.g. full house [[13,3],[4,2]].
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const byGroup = groups.map(([value]) => value);
    const index = (category: HandCategory): number => HAND_CATEGORIES.indexOf(category);

    const make = (category: HandCategory, tiebreak: number[]): HandRank => ({
        category,
        score: [index(category), ...tiebreak],
        cards,
    });

    if (flush && straight) {
        return make(straight === 14 ? 'royal-flush' : 'straight-flush', [straight]);
    }
    if (groups[0]![1] === 4) return make('four-of-a-kind', byGroup);
    if (groups[0]![1] === 3 && groups[1]![1] === 2) return make('full-house', byGroup);
    if (flush) return make('flush', values);
    if (straight) return make('straight', [straight]);
    if (groups[0]![1] === 3) return make('three-of-a-kind', byGroup);
    if (groups[0]![1] === 2 && groups[1]![1] === 2) return make('two-pair', byGroup);
    if (groups[0]![1] === 2) return make('pair', byGroup);
    return make('high-card', values);
}

/** Best five-card hand out of 5-7 cards (hole cards + board). */
export function bestHand(cards: PlayingCard[]): HandRank {
    if (cards.length < 5) throw new Error('A poker hand needs at least five cards.');
    let best: HandRank | null = null;
    const n = cards.length;
    for (let a = 0; a < n - 4; a++)
        for (let b = a + 1; b < n - 3; b++)
            for (let c = b + 1; c < n - 2; c++)
                for (let d = c + 1; d < n - 1; d++)
                    for (let e = d + 1; e < n; e++) {
                        const rank = rankFive([
                            cards[a]!,
                            cards[b]!,
                            cards[c]!,
                            cards[d]!,
                            cards[e]!,
                        ]);
                        if (!best || compareHands(rank, best) > 0) best = rank;
                    }
    return best!;
}
