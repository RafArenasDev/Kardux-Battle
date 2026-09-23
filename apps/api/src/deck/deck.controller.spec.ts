import { describe, expect, it } from 'vitest';
import { DeckService } from './deck.service.js';

describe('DeckService', () => {
    it('lists every original deck as ready, with limits and a preview', () => {
        const sources = new DeckService().listSources();

        expect(sources.map((source) => source.id)).toEqual(['mythic', 'fauna', 'naipes']);
        for (const source of sources) {
            expect(source.ready).toBe(true);
            expect(source.preview.length).toBeGreaterThan(0);
            expect(source.maxPacks).toBeGreaterThanOrEqual(4);
            expect(source.cardCount).toBeGreaterThanOrEqual(32);
        }
    });
});
