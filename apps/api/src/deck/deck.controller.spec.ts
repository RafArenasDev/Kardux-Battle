import { describe, expect, it } from 'vitest';
import type { CardPoolService } from './card-pool.service.js';
import { DeckService } from './deck.service.js';

const emptyPool = { getFamilies: async () => [] } as unknown as CardPoolService;

describe('DeckService', () => {
    it('lists the Pokémon deck, not ready until its pool is synced', async () => {
        const sources = await new DeckService(emptyPool).listSources();

        expect(sources.map((source) => source.id)).toEqual(['pokeapi']);
        expect(sources[0]?.ready).toBe(false);
        expect(sources[0]?.attributes.map((attribute) => attribute.key)).toContain('hp');
    });
});
