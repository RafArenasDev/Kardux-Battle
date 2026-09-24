import { describe, expect, it } from 'vitest';
import { placementsOf, ratingChanges } from './rating.js';

describe('ratingChanges', () => {
    it('moves equal ratings by K/2 in a duel', () => {
        const changes = ratingChanges([
            { id: 'a', rating: 1200, placement: 1 },
            { id: 'b', rating: 1200, placement: 2 },
        ]);
        expect(changes.get('a')).toBe(16);
        expect(changes.get('b')).toBe(-16);
    });

    it('rewards an upset more than an expected win', () => {
        const upset = ratingChanges([
            { id: 'weak', rating: 1000, placement: 1 },
            { id: 'strong', rating: 1400, placement: 2 },
        ]);
        const expected = ratingChanges([
            { id: 'strong', rating: 1400, placement: 1 },
            { id: 'weak', rating: 1000, placement: 2 },
        ]);
        expect(upset.get('weak')!).toBeGreaterThan(expected.get('strong')!);
    });

    it('keeps a draw between equals neutral', () => {
        const changes = ratingChanges([
            { id: 'a', rating: 1300, placement: 1 },
            { id: 'b', rating: 1300, placement: 1 },
        ]);
        expect(changes.get('a')).toBe(0);
        expect(changes.get('b')).toBe(0);
    });

    it('is zero-sum (within rounding) across a full table', () => {
        const changes = ratingChanges([
            { id: 'a', rating: 1250, placement: 1 },
            { id: 'b', rating: 1180, placement: 2 },
            { id: 'c', rating: 1320, placement: 3 },
            { id: 'd', rating: 1100, placement: 4 },
        ]);
        const total = [...changes.values()].reduce((sum, value) => sum + value, 0);
        expect(Math.abs(total)).toBeLessThanOrEqual(2);
        expect(changes.get('a')!).toBeGreaterThan(0);
        expect(changes.get('d')!).toBeLessThan(0);
    });
});

describe('placementsOf', () => {
    it('ranks by cards, shares equal counts and puts leavers last', () => {
        const placements = placementsOf([
            { id: 'quitter', cardCount: 0, hasLeft: true },
            { id: 'a', cardCount: 20, hasLeft: false },
            { id: 'b', cardCount: 6, hasLeft: false },
            { id: 'c', cardCount: 6, hasLeft: false },
            { id: 'out', cardCount: 0, hasLeft: false },
        ]);
        expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 2, c: 2, out: 4, quitter: 5 });
    });
});
