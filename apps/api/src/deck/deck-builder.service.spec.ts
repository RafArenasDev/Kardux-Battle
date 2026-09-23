import { describe, expect, it } from 'vitest';
import type { CardPoolService } from './card-pool.service.js';
import { DeckBuilder } from './deck-builder.service.js';

/** No synced pool: exercises the bundled decks and the offline poker fallback. */
const emptyPool = { getFamilies: async () => [] } as unknown as CardPoolService;

const base = { mixSources: false, maxPlayers: 4 } as const;

describe('DeckBuilder', async () => {
    const builder = new DeckBuilder(emptyPool);

    it('builds packs x cardsPerPack cards with real quartets (same family per letter)', async () => {
        const cards = await builder.build(
            { ...base, deckSources: ['mythic'], packs: 4, cardsPerPack: 8, attributeCount: 4 },
            { seed: 'seed-1' },
        );

        expect(cards).toHaveLength(32);
        expect(new Set(cards.map((card) => card.code)).size).toBe(32);

        const byQuartet = new Map<string, string[]>();
        for (const card of cards) {
            byQuartet.set(card.quartet, [...(byQuartet.get(card.quartet) ?? []), card.name]);
            expect(Object.keys(card.stats)).toEqual(['poder', 'defensa', 'velocidad', 'magia']);
            expect(card.imageUrl.startsWith('data:image/svg+xml')).toBe(true);
        }
        expect(byQuartet.size).toBe(8);
    });

    it('is deterministic for a given seed', async () => {
        const config = {
            ...base,
            deckSources: ['fauna'] as const,
            packs: 4,
            cardsPerPack: 6,
            attributeCount: 3,
        };
        const first = await builder.build({ ...config, deckSources: ['fauna'] }, { seed: 'same' });
        const second = await builder.build({ ...config, deckSources: ['fauna'] }, { seed: 'same' });
        expect(first).toEqual(second);
    });

    it('rejects an attribute count the deck cannot offer', async () => {
        await expect(
            builder.build(
                { ...base, deckSources: ['naipes'], packs: 4, cardsPerPack: 8, attributeCount: 4 },
                { seed: 'x' },
            ),
        ).rejects.toThrow(/atributos/);
    });

    it('falls back to the bundled French deck when the poker pool is not synced', async () => {
        const cards = await builder.build(
            { ...base, deckSources: ['deckofcards'], packs: 4, cardsPerPack: 8, attributeCount: 3 },
            { seed: 'poker' },
        );
        expect(cards).toHaveLength(32);
        expect(cards.every((card) => card.source === 'deckofcards')).toBe(true);
    });

    it('rejects more packs than a family has members', async () => {
        await expect(
            builder.build(
                { ...base, deckSources: ['fauna'], packs: 5, cardsPerPack: 4, attributeCount: 3 },
                { seed: 'x' },
            ),
        ).rejects.toThrow(/paquetes/);
    });
});
