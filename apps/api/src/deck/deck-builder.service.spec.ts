import type { DeckEntity } from '@kardux/content';
import { describe, expect, it } from 'vitest';
import type { CardPoolService } from './card-pool.service.js';
import { DeckBuilder } from './deck-builder.service.js';

const TYPES = ['fire', 'water', 'grass', 'electric', 'ice', 'rock', 'ghost', 'dragon', 'steel'];

/** A synced-looking pool: 9 Pokémon types with 5 members each. */
function family(type: string): DeckEntity[] {
    return Array.from({ length: 5 }, (_, index) => ({
        id: `pokeapi:${type}-${index}`,
        familyKey: `pokeapi:${type}`,
        name: `${type} ${index}`,
        nameEn: `${type} ${index}`,
        imageUrl: `https://example.com/${type}-${index}.png`,
        stats: {
            hp: 40 + index,
            attack: 50 + index,
            defense: 60 + index,
            speed: 70 + index,
            'special-attack': 80 + index,
            'special-defense': 90 + index,
        },
    }));
}

const syncedPool = {
    getFamilies: async () => TYPES.map(family),
} as unknown as CardPoolService;
const emptyPool = { getFamilies: async () => [] } as unknown as CardPoolService;

const base = { deckSources: ['pokeapi' as const], mixSources: false, maxPlayers: 4 };

describe('DeckBuilder', () => {
    const builder = new DeckBuilder(syncedPool);

    it('builds packs x cardsPerPack cards with real quartets (one type per letter)', async () => {
        const cards = await builder.build(
            { ...base, packs: 4, cardsPerPack: 8, attributeCount: 4 },
            { seed: 'seed-1' },
        );

        expect(cards).toHaveLength(32);
        expect(new Set(cards.map((card) => card.code)).size).toBe(32);

        const typesByQuartet = new Map<string, Set<string>>();
        for (const card of cards) {
            const type = card.name.split(' ')[0]!;
            typesByQuartet.set(
                card.quartet,
                (typesByQuartet.get(card.quartet) ?? new Set()).add(type),
            );
            expect(Object.keys(card.stats)).toEqual(['hp', 'attack', 'defense', 'speed']);
        }
        expect(typesByQuartet.size).toBe(8);
        for (const types of typesByQuartet.values()) expect(types.size).toBe(1);
    });

    it('is deterministic for a given seed', async () => {
        const config = { ...base, packs: 4, cardsPerPack: 6, attributeCount: 3 };
        expect(await builder.build(config, { seed: 'same' })).toEqual(
            await builder.build(config, { seed: 'same' }),
        );
    });

    it('rejects more packs than the deck allows', async () => {
        await expect(
            builder.build({ ...base, packs: 7, cardsPerPack: 4, attributeCount: 3 }, { seed: 'x' }),
        ).rejects.toThrow(/packs/);
    });

    it('explains when the pool has not been synced yet', async () => {
        await expect(
            new DeckBuilder(emptyPool).build(
                { ...base, packs: 4, cardsPerPack: 8, attributeCount: 4 },
                { seed: 'x' },
            ),
        ).rejects.toThrow(/downloaded/);
    });
});
