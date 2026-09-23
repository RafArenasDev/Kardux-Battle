import { describe, expect, it, vi } from 'vitest';
import { DeckBuilder } from './deck-builder.service.js';
import type { GithubSyncClient, GithubSyncManifest } from './github-sync.client.js';

function fakeGithubSync(
    manifest: GithubSyncManifest,
    decks: Record<string, unknown[]>,
): GithubSyncClient {
    return {
        getManifest: vi.fn().mockResolvedValue(manifest),
        getDeck: vi.fn(async (path: string) => decks[path]),
    } as unknown as GithubSyncClient;
}

describe('DeckBuilder', () => {
    describe('local source (fully offline)', () => {
        it('builds a deck with the requested size, card-code format, and attribute set', async () => {
            const builder = new DeckBuilder(fakeGithubSync({ decks: [] }, {}));

            const cards = await builder.build(
                {
                    deckSources: ['local'],
                    packs: 4,
                    cardsPerPack: 8,
                    attributeCount: 4,
                    mixSources: false,
                },
                { seed: 'test-seed-1' },
            );

            expect(cards).toHaveLength(32);
            for (const card of cards) {
                expect(card.code).toMatch(/^[1-4][A-H]$/);
                expect(card.source).toBe('local');
                expect(Object.keys(card.stats)).toHaveLength(4);
                for (const value of Object.values(card.stats)) {
                    expect(Number.isFinite(value)).toBe(true);
                }
                expect(() => new URL(card.imageUrl)).not.toThrow();
            }

            // Every card is unique (no duplicate entity picked twice).
            expect(new Set(cards.map((c) => c.name + c.imageUrl)).size).toBe(32);
        });

        it('is deterministic for the same seed and varies for a different seed', async () => {
            const builder = new DeckBuilder(fakeGithubSync({ decks: [] }, {}));
            const options: Parameters<DeckBuilder['build']>[0] = {
                deckSources: ['local'],
                packs: 2,
                cardsPerPack: 4,
                attributeCount: 3,
                mixSources: false,
            };

            const a = await builder.build(options, { seed: 'same-seed' });
            const b = await builder.build(options, { seed: 'same-seed' });
            const c = await builder.build(options, { seed: 'different-seed' });

            expect(a).toEqual(b);
            expect(a).not.toEqual(c);
        });

        it('supports every legal cardsPerPack up to the 26-letter alphabet ceiling', async () => {
            const builder = new DeckBuilder(fakeGithubSync({ decks: [] }, {}));

            const cards = await builder.build(
                {
                    deckSources: ['local'],
                    packs: 2,
                    cardsPerPack: 26,
                    attributeCount: 3,
                    mixSources: false,
                },
                { seed: 'alphabet' },
            );

            expect(cards).toHaveLength(52);
            expect(new Set(cards.map((c) => c.quartet)).size).toBe(26);
        });
    });

    describe('pokeapi source (synced tcg-github-sync data)', () => {
        const manifest: GithubSyncManifest = {
            decks: [
                {
                    source: 'pokeapi',
                    tcg: null,
                    deck: 'pokemon',
                    name: 'Pokémon',
                    count: 3,
                    path: 'data/pokeapi/pokemon.json',
                },
            ],
        };
        const rawPokemon = [1, 2, 3].map((id) => ({
            source: 'pokeapi',
            deck: 'pokemon',
            id,
            name: `mon-${id}`,
            image: {
                small: `https://example.test/${id}-small.png`,
                medium: `https://example.test/${id}.png`,
                large: '',
            },
            attributes: {
                stats: {
                    hp: 40 + id,
                    attack: 50 + id,
                    defense: 45 + id,
                    'special-attack': 55 + id,
                    speed: 60 + id,
                },
                weight: 100 + id,
            },
        }));

        it('normalizes real stats.* + weight fields into numeric Card.stats', async () => {
            const builder = new DeckBuilder(
                fakeGithubSync(manifest, { 'data/pokeapi/pokemon.json': rawPokemon }),
            );

            const cards = await builder.build(
                {
                    deckSources: ['pokeapi'],
                    packs: 1,
                    cardsPerPack: 3,
                    attributeCount: 6,
                    mixSources: false,
                },
                { seed: 'poke-seed' },
            );

            expect(cards).toHaveLength(3);
            for (const card of cards) {
                expect(Object.keys(card.stats).sort()).toEqual(
                    ['attack', 'defense', 'hp', 'special-attack', 'speed', 'weight'].sort(),
                );
                expect(card.source).toBe('pokeapi');
            }
        });

        it('rejects a config asking for more cards than the source has', async () => {
            const builder = new DeckBuilder(
                fakeGithubSync(manifest, { 'data/pokeapi/pokemon.json': rawPokemon }),
            );

            await expect(
                builder.build(
                    {
                        deckSources: ['pokeapi'],
                        packs: 4,
                        cardsPerPack: 8,
                        attributeCount: 4,
                        mixSources: false,
                    },
                    { seed: 'too-big' },
                ),
            ).rejects.toMatchObject({ code: 'ERR_INVALID_CONFIG' });
        });
    });

    describe('deckofcards source', () => {
        const manifest: GithubSyncManifest = {
            decks: [
                {
                    source: 'deckofcards',
                    tcg: null,
                    deck: 'poker-standard',
                    name: 'Standard',
                    count: 3,
                    path: 'data/deckofcards/standard-52.json',
                },
            ],
        };
        const rawCards = [
            {
                source: 'deckofcards',
                deck: 'poker-standard',
                id: '7H',
                name: '7 of HEARTS',
                image: { small: 'https://x/7H.png', medium: '', large: '' },
                attributes: { value: '7', suit: 'HEARTS' },
            },
            {
                source: 'deckofcards',
                deck: 'poker-standard',
                id: '0D',
                name: '10 of DIAMONDS',
                image: { small: 'https://x/0D.png', medium: '', large: '' },
                attributes: { value: '0', suit: 'DIAMONDS' },
            },
            {
                source: 'deckofcards',
                deck: 'poker-standard',
                id: 'AS',
                name: 'ACE of SPADES',
                image: { small: 'https://x/AS.png', medium: '', large: '' },
                attributes: { value: 'A', suit: 'SPADES' },
            },
        ];

        it('derives rank (2-14, "0"=10) and suitRank from the raw value/suit strings', async () => {
            const builder = new DeckBuilder(
                fakeGithubSync(manifest, { 'data/deckofcards/standard-52.json': rawCards }),
            );

            const cards = await builder.build(
                {
                    deckSources: ['deckofcards'],
                    packs: 1,
                    cardsPerPack: 3,
                    attributeCount: 3,
                    mixSources: false,
                },
                { seed: 'cards-seed' },
            );

            const byName = new Map(cards.map((c) => [c.name, c]));
            expect(byName.get('7 of HEARTS')?.stats.rank).toBe(7);
            expect(byName.get('10 of DIAMONDS')?.stats.rank).toBe(10);
            expect(byName.get('ACE of SPADES')?.stats.rank).toBe(14);
            expect(byName.get('ACE of SPADES')?.stats.suitRank).toBe(4);
        });

        it('rejects attributeCount above what deckofcards can genuinely offer (3)', async () => {
            const builder = new DeckBuilder(
                fakeGithubSync(manifest, { 'data/deckofcards/standard-52.json': rawCards }),
            );

            await expect(
                builder.build(
                    {
                        deckSources: ['deckofcards'],
                        packs: 1,
                        cardsPerPack: 3,
                        attributeCount: 4,
                        mixSources: false,
                    },
                    { seed: 'too-many-attrs' },
                ),
            ).rejects.toMatchObject({ code: 'ERR_INVALID_CONFIG' });
        });
    });

    describe('apitcg source', () => {
        it('discards cards with no parseable HP (e.g. Trainer/Energy cards)', async () => {
            const manifest: GithubSyncManifest = {
                decks: [
                    {
                        source: 'apitcg',
                        tcg: 'pokemon',
                        deck: 'set',
                        name: 'set',
                        count: 2,
                        path: 'data/apitcg/pokemon/set.json',
                    },
                ],
            };
            const raw = [
                {
                    source: 'apitcg',
                    deck: 'set',
                    id: 1,
                    name: 'Abra',
                    image: { small: 'https://x/1.png', medium: '', large: '' },
                    attributes: { HP: '30' },
                },
                {
                    source: 'apitcg',
                    deck: 'set',
                    id: 2,
                    name: 'Trainer Card',
                    image: { small: 'https://x/2.png', medium: '', large: '' },
                    attributes: { Rarity: 'Common' },
                },
            ];
            const builder = new DeckBuilder(
                fakeGithubSync(manifest, { 'data/apitcg/pokemon/set.json': raw }),
            );

            const cards = await builder.build(
                {
                    deckSources: ['apitcg'],
                    packs: 1,
                    cardsPerPack: 1,
                    attributeCount: 1,
                    mixSources: false,
                },
                { seed: 'apitcg-seed' },
            );

            expect(cards).toHaveLength(1);
            expect(cards[0]?.name).toBe('Abra');
            expect(cards[0]?.stats).toEqual({ hp: 30 });
        });
    });
});
