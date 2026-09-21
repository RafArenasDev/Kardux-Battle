import { describe, expect, it } from 'vitest';
import { createRngState, nextInt, nextRandom, shuffle } from './rng.js';

describe('createRngState + nextRandom', () => {
    it('is deterministic: the same seed always produces the same sequence', () => {
        const stateA = createRngState('seed-1');
        const stateB = createRngState('seed-1');

        const [valueA1, nextA] = nextRandom(stateA);
        const [valueB1, nextB] = nextRandom(stateB);
        const [valueA2] = nextRandom(nextA);
        const [valueB2] = nextRandom(nextB);

        expect(valueA1).toBe(valueB1);
        expect(valueA2).toBe(valueB2);
    });

    it('produces different sequences for different seeds', () => {
        const [valueA] = nextRandom(createRngState('seed-1'));
        const [valueB] = nextRandom(createRngState('seed-2'));

        expect(valueA).not.toBe(valueB);
    });

    it('always returns a value in [0, 1)', () => {
        let currentState = createRngState('range-check');

        for (let i = 0; i < 200; i++) {
            const [value, nextState] = nextRandom(currentState);
            currentState = nextState;

            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('never repeats its internal state across draws (a real generator, not a constant)', () => {
        let currentState = createRngState('progression-check');
        const seen = new Set<string>();

        for (let i = 0; i < 50; i++) {
            const [, nextState] = nextRandom(currentState);
            seen.add(JSON.stringify(nextState));
            currentState = nextState;
        }

        expect(seen.size).toBe(50);
    });
});

describe('nextInt', () => {
    it('never returns a value outside [0, max)', () => {
        let currentState = createRngState('int-check');

        for (let i = 0; i < 200; i++) {
            const [value, nextState] = nextInt(7, currentState);
            currentState = nextState;

            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(7);
        }
    });
});

describe('shuffle', () => {
    it('is a permutation - same elements, same length, none dropped or duplicated', () => {
        const items = Array.from({ length: 20 }, (_, i) => i);
        const [shuffled] = shuffle(items, createRngState('permutation-check'));

        expect(shuffled).toHaveLength(items.length);
        expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    });

    it('is deterministic for the same seed', () => {
        const items = ['a', 'b', 'c', 'd', 'e', 'f'];
        const [shuffledA] = shuffle(items, createRngState('shuffle-seed'));
        const [shuffledB] = shuffle(items, createRngState('shuffle-seed'));

        expect(shuffledA).toEqual(shuffledB);
    });

    it('actually reorders (overwhelmingly likely for a non-trivial input)', () => {
        const items = Array.from({ length: 30 }, (_, i) => i);
        const [shuffled] = shuffle(items, createRngState('reorder-check'));

        expect(shuffled).not.toEqual(items);
    });

    it('does not mutate the input array', () => {
        const items = [1, 2, 3, 4, 5];
        const copy = [...items];
        shuffle(items, createRngState('no-mutate-check'));

        expect(items).toEqual(copy);
    });
});
