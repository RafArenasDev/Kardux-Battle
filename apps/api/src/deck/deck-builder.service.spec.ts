import { describe, expect, it } from 'vitest';
import { DeckBuilder } from './deck-builder.service.js';

const base = { mixSources: false, maxPlayers: 4 } as const;

describe('DeckBuilder', () => {
    const builder = new DeckBuilder();

    it('builds packs x cardsPerPack cards with real quartets (same family per letter)', () => {
        const cards = builder.build(
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

    it('is deterministic for a given seed', () => {
        const config = {
            ...base,
            deckSources: ['fauna'] as const,
            packs: 4,
            cardsPerPack: 6,
            attributeCount: 3,
        };
        const first = builder.build({ ...config, deckSources: ['fauna'] }, { seed: 'same' });
        const second = builder.build({ ...config, deckSources: ['fauna'] }, { seed: 'same' });
        expect(first).toEqual(second);
    });

    it('rejects an attribute count the deck cannot offer', () => {
        expect(() =>
            builder.build(
                { ...base, deckSources: ['naipes'], packs: 4, cardsPerPack: 8, attributeCount: 4 },
                { seed: 'x' },
            ),
        ).toThrow(/atributos/);
    });

    it('rejects more packs than a family has members', () => {
        expect(() =>
            builder.build(
                { ...base, deckSources: ['fauna'], packs: 5, cardsPerPack: 4, attributeCount: 3 },
                { seed: 'x' },
            ),
        ).toThrow(/paquetes/);
    });
});
