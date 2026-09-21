import { describe, expect, it } from 'vitest';
import { dealDeck } from './deal.js';
import { createRngState } from './rng.js';
import { card } from './test-helpers.js';

function buildDeck(count: number): ReturnType<typeof card>[] {
    return Array.from({ length: count }, (_, i) => card(`${i}A`, 'A', { power: i }));
}

describe('dealDeck', () => {
    it('deals every card when the deck divides evenly among players', () => {
        const deck = buildDeck(12);
        const players = ['p1', 'p2', 'p3', 'p4'];
        const { piles } = dealDeck(deck, players, createRngState('even-deal'));

        const totalDealt = Object.values(piles).reduce((sum, pile) => sum + pile.length, 0);

        expect(totalDealt).toBe(12);
        for (const playerId of players) {
            expect(piles[playerId]).toHaveLength(3);
        }
    });

    it('discards the remainder when the deck does not divide evenly ("mazo no divisible")', () => {
        // 10 cards / 3 players = 3 each, 1 card discarded.
        const deck = buildDeck(10);
        const players = ['p1', 'p2', 'p3'];
        const { piles } = dealDeck(deck, players, createRngState('uneven-deal'));

        const totalDealt = Object.values(piles).reduce((sum, pile) => sum + pile.length, 0);

        expect(totalDealt).toBe(9);
        for (const playerId of players) {
            expect(piles[playerId]).toHaveLength(3);
        }
    });

    it('discards a random card, not always the same position in the deck', () => {
        const deck = buildDeck(10);
        const players = ['p1', 'p2', 'p3'];

        const discardedCards = new Set<string>();

        for (let i = 0; i < 20; i++) {
            const { piles } = dealDeck(deck, players, createRngState(`seed-${i}`));
            const dealtCodes = new Set(
                Object.values(piles)
                    .flat()
                    .map((c) => c.code),
            );
            const discarded = deck.find((c) => !dealtCodes.has(c.code))!;
            discardedCards.add(discarded.code);
        }

        // Across 20 different seeds, the discarded card should vary - if it were always the
        // same position (e.g. always the last card in original order), this set would have
        // exactly one member instead.
        expect(discardedCards.size).toBeGreaterThan(1);
    });

    it('is deterministic for the same seed', () => {
        const deck = buildDeck(12);
        const players = ['p1', 'p2', 'p3', 'p4'];

        const resultA = dealDeck(deck, players, createRngState('same-seed'));
        const resultB = dealDeck(deck, players, createRngState('same-seed'));

        expect(resultA.piles).toEqual(resultB.piles);
    });

    it('never deals the same card to two different players', () => {
        const deck = buildDeck(16);
        const players = ['p1', 'p2', 'p3', 'p4'];
        const { piles } = dealDeck(deck, players, createRngState('no-dup-check'));

        const allCodes = Object.values(piles)
            .flat()
            .map((c) => c.code);

        expect(new Set(allCodes).size).toBe(allCodes.length);
    });
});
