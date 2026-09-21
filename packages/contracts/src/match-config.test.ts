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
            deckSources: ['local'],
            mixSources: false,
            allowSpectators: true,
            fillWithBots: false,
            visibility: 'public',
        });
    });

    it('rejects minPlayers greater than maxPlayers', () => {
        const result = matchConfigSchema.safeParse({ minPlayers: 8, maxPlayers: 4 });

        expect(result.success).toBe(false);
    });

    it('rejects autoStartPlayers outside the min/max range', () => {
        const tooLow = matchConfigSchema.safeParse({
            minPlayers: 4,
            maxPlayers: 8,
            autoStartPlayers: 3,
        });
        const tooHigh = matchConfigSchema.safeParse({
            minPlayers: 4,
            maxPlayers: 8,
            autoStartPlayers: 9,
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

    it('rejects multiple deck sources without mixSources', () => {
        const result = matchConfigSchema.safeParse({
            deckSources: ['pokeapi', 'naruto'],
            mixSources: false,
        });

        expect(result.success).toBe(false);
    });

    it('accepts multiple deck sources with mixSources enabled', () => {
        const result = matchConfigSchema.safeParse({
            deckSources: ['pokeapi', 'naruto'],
            mixSources: true,
        });

        expect(result.success).toBe(true);
    });

    it('rejects an attributeCount outside 3..6', () => {
        expect(matchConfigSchema.safeParse({ attributeCount: 2 }).success).toBe(false);
        expect(matchConfigSchema.safeParse({ attributeCount: 7 }).success).toBe(false);
    });
});
