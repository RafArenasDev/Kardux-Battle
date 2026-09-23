import { describe, expect, it } from 'vitest';
import type { CardPoolService } from './card-pool.service.js';
import { DeckService } from './deck.service.js';

const emptyPool = { getFamilies: async () => [] } as unknown as CardPoolService;

describe('DeckService', () => {
    it('lists every battle deck in lobby order', async () => {
        const sources = await new DeckService(emptyPool).listSources();

        expect(sources.map((source) => source.id)).toEqual([
            'pokeapi',
            'paises',
            'mythic',
            'autos',
            'motos',
            'aviones',
            'deckofcards',
        ]);
        // API decks are not ready until their pool syncs (the classic deck falls back to bundled art).
        expect(sources[0]?.ready).toBe(false);
        expect(sources[1]?.ready).toBe(false);
        for (const source of sources.slice(2)) {
            expect(source.ready).toBe(true);
            expect(source.preview.length).toBeGreaterThan(0);
            expect(source.maxPacks).toBeGreaterThanOrEqual(4);
            expect(source.cardCount).toBeGreaterThanOrEqual(32);
        }
    });
});
