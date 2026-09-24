import { describe, expect, it } from 'vitest';
import { matchConfigSchema } from './match-config.js';

describe('matchConfigSchema', () => {
    it('fills in every default when given an empty object', () => {
        const result = matchConfigSchema.parse({});

        expect(result).toMatchObject({
            minPlayers: 2,
            maxPlayers: 7,
            autoStartPlayers: 7,
            autoStartCountdownMs: 5_000,
            matchDurationMs: 3_600_000,
            turnTimeoutMs: 30_000,
            onTurnTimeout: 'random_attr',
            packs: 4,
            cardsPerPack: 8,
            attributeCount: 4,
            deckSources: ['pokeapi'],
            mixSources: false,
            allowSpectators: true,
            fillWithBots: false,
            visibility: 'private',
        });
    });

    it('rejects minPlayers greater than maxPlayers', () => {
        const result = matchConfigSchema.safeParse({ minPlayers: 6, maxPlayers: 4 });

        expect(result.success).toBe(false);
    });

    it('rejects autoStartPlayers outside the min/max range', () => {
        const tooLow = matchConfigSchema.safeParse({
            minPlayers: 4,
            maxPlayers: 6,
            autoStartPlayers: 3,
        });
        const tooHigh = matchConfigSchema.safeParse({
            minPlayers: 4,
            maxPlayers: 6,
            autoStartPlayers: 7,
        });

        expect(tooLow.success).toBe(false);
        expect(tooHigh.success).toBe(false);
    });

    it('rejects a deck too small for the configured maxPlayers', () => {
        // 2 packs * 2 cards = 4 total cards, but up to 7 players is allowed by default.
        const result = matchConfigSchema.safeParse({ packs: 2, cardsPerPack: 2 });

        expect(result.success).toBe(false);
    });

    it('accepts a deck exactly large enough for maxPlayers', () => {
        const result = matchConfigSchema.safeParse({
            maxPlayers: 4,
            autoStartPlayers: 4,
            packs: 2,
            cardsPerPack: 2,
        });

        expect(result.success).toBe(true);
    });

    it('rejects more than the 7 players of the original rules', () => {
        expect(matchConfigSchema.safeParse({ maxPlayers: 8 }).success).toBe(false);
    });

    it('only accepts the Pokémon deck', () => {
        expect(matchConfigSchema.safeParse({ deckSources: ['mythic'] }).success).toBe(false);
    });

    it('rejects an attributeCount outside 1..6 (1 = single-attribute decks)', () => {
        expect(matchConfigSchema.safeParse({ attributeCount: 0 }).success).toBe(false);
        expect(matchConfigSchema.safeParse({ attributeCount: 7 }).success).toBe(false);
    });
});
