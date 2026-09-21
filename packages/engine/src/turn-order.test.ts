import { describe, expect, it } from 'vitest';
import { buildTurnOrder, findFirstTurnPlayerId, rotateToLeader } from './turn-order.js';
import { card } from './test-helpers.js';

describe('findFirstTurnPlayerId', () => {
    it('picks whoever holds 1A when it was dealt', () => {
        const piles = {
            alice: [card('2A', 'A', {})],
            bob: [card('1A', 'A', {})],
            carol: [card('1B', 'B', {})],
        };

        expect(findFirstTurnPlayerId(piles, 2, 2)).toBe('bob');
    });

    it('falls through in "1A, 1B, ... 2A, 2B, ..." order when 1A was discarded', () => {
        // Deck is packs=2, cardsPerPack=2 (codes 1A, 1B, 2A, 2B); 1A never made it into any pile.
        const piles = {
            alice: [card('2A', 'A', {})],
            bob: [card('1B', 'B', {})],
        };

        expect(findFirstTurnPlayerId(piles, 2, 2)).toBe('bob');
    });

    it('keeps searching past a pack whose letters were entirely discarded', () => {
        const piles = {
            alice: [card('2B', 'B', {})],
        };

        expect(findFirstTurnPlayerId(piles, 2, 2)).toBe('alice');
    });

    it('returns null when nothing in the search space was actually dealt', () => {
        const piles = { alice: [card('9Z', 'Z', {})] };

        expect(findFirstTurnPlayerId(piles, 2, 2)).toBeNull();
    });

    it('finds a code buried under other cards in a pile, not just the top one', () => {
        const piles = {
            alice: [card('2A', 'A', {}), card('1A', 'A', {})],
        };

        expect(findFirstTurnPlayerId(piles, 2, 2)).toBe('alice');
    });
});

describe('buildTurnOrder', () => {
    it('sorts by joinOrder regardless of input order', () => {
        const players = [
            { id: 'c', joinOrder: 2 },
            { id: 'a', joinOrder: 0 },
            { id: 'b', joinOrder: 1 },
        ];

        expect(buildTurnOrder(players)).toEqual(['a', 'b', 'c']);
    });
});

describe('rotateToLeader', () => {
    it('rotates the array to start at the leader, preserving relative order', () => {
        expect(rotateToLeader(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'd', 'a', 'b']);
    });

    it('is a no-op when the leader is already first', () => {
        expect(rotateToLeader(['a', 'b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
    });

    it('throws when the leader is not part of the turn order', () => {
        expect(() => rotateToLeader(['a', 'b'], 'z')).toThrow();
    });
});
