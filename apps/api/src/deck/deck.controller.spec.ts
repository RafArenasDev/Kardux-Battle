import { describe, expect, it } from 'vitest';
import type { CardPoolService } from './card-pool.service.js';
import { DeckService } from './deck.service.js';

const emptyPool = { getFamilies: async () => [] } as unknown as CardPoolService;

describe('DeckService', () => {
    it('lists Pokémon first, then the bundled battle decks (never the poker deck)', async () => {
        const sources = await new DeckService(emptyPool).listSources();

        expect(sources.map((source) => source.id)).toEqual(['pokeapi', 'motores', 'mythic']);
        // Pokémon is not ready until its pool syncs; bundled decks always are.
        expect(sources[0]?.ready).toBe(false);
        for (const source of sources.slice(1)) {
            expect(source.ready).toBe(true);
            expect(source.preview.length).toBeGreaterThan(0);
            expect(source.maxPacks).toBeGreaterThanOrEqual(4);
            expect(source.cardCount).toBeGreaterThanOrEqual(32);
        }
    });
});
