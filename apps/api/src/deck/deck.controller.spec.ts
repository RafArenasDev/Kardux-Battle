import { describe, expect, it } from 'vitest';
import type { CardPoolService } from './card-pool.service.js';
import { DeckService } from './deck.service.js';

const emptyPool = { getFamilies: async () => [] } as unknown as CardPoolService;

describe('DeckService', () => {
    it('lists Pokémon and poker first, then the bundled decks', async () => {
        const sources = await new DeckService(emptyPool).listSources();

        expect(sources.map((source) => source.id)).toEqual([
            'pokeapi',
            'deckofcards',
            'mythic',
            'fauna',
        ]);
        // Pokémon is not ready until its pool syncs; poker falls back to the bundled deck.
        expect(sources[0]?.ready).toBe(false);
        for (const source of sources.slice(1)) {
            expect(source.ready).toBe(true);
            expect(source.preview.length).toBeGreaterThan(0);
            expect(source.maxPacks).toBeGreaterThanOrEqual(4);
            expect(source.cardCount).toBeGreaterThanOrEqual(32);
        }
    });
});
