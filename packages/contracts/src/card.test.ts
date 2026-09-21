import { describe, expect, it } from 'vitest';
import { cardSchema } from './card.js';

const validCard = {
    code: '1A',
    quartet: 'A',
    name: 'Bulbasaur',
    imageUrl: 'https://example.com/bulbasaur.png',
    source: 'pokeapi',
    stats: { hp: 45, attack: 49, defense: 49, speed: 45 },
};

describe('cardSchema', () => {
    it('accepts a well-formed card', () => {
        expect(cardSchema.safeParse(validCard).success).toBe(true);
    });

    it.each(['1a', 'A1', '1AB', '', '1'])('rejects a malformed code "%s"', (code) => {
        const result = cardSchema.safeParse({ ...validCard, code });

        expect(result.success).toBe(false);
    });

    it.each(['AA', '1', 'a', ''])('rejects a malformed quartet "%s"', (quartet) => {
        const result = cardSchema.safeParse({ ...validCard, quartet });

        expect(result.success).toBe(false);
    });

    it('rejects an unknown deck source', () => {
        const result = cardSchema.safeParse({ ...validCard, source: 'not-a-real-source' });

        expect(result.success).toBe(false);
    });

    it('rejects a non-URL imageUrl', () => {
        const result = cardSchema.safeParse({ ...validCard, imageUrl: 'not-a-url' });

        expect(result.success).toBe(false);
    });
});
