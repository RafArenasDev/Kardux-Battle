import type { DeckEntity } from '@kardux/content';
import { POKEMON_TYPE_LABELS } from '@kardux/content';
import type { Prisma } from '@prisma/client';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';

export type RemoteSource = 'pokeapi' | 'deckofcards';

const POKEAPI_GRAPHQL = 'https://beta.pokeapi.co/graphql/v1beta';
const POKEMON_ARTWORK = (id: number) =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const DECKOFCARDS_DRAW = 'https://deckofcardsapi.com/api/deck/new/draw/?count=52';

/** Re-sync at most weekly; otherwise every boot is served straight from the database. */
const RESYNC_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const SPANISH_LANGUAGE_ID = 7;
/** Default forms of the national dex - excludes megas/regional variants with odd ids. */
const MAX_POKEMON_ID = 1025;

interface PokemonRow {
    id: number;
    name: string;
    pokemon_v2_pokemonstats: { base_stat: number; pokemon_v2_stat: { name: string } }[];
    pokemon_v2_pokemontypes: { pokemon_v2_type: { name: string } }[];
    pokemon_v2_pokemonspecy: { pokemon_v2_pokemonspeciesnames: { name: string }[] } | null;
}

interface DeckOfCardsCard {
    code: string;
    image: string;
    images?: { png?: string; svg?: string };
    value: string;
    suit: string;
}

const CARD_VALUE: Record<string, { value: number; name: string }> = {
    ACE: { value: 14, name: 'As' },
    KING: { value: 13, name: 'Rey' },
    QUEEN: { value: 12, name: 'Reina' },
    JACK: { value: 11, name: 'Jota' },
    '10': { value: 10, name: 'Diez' },
    '9': { value: 9, name: 'Nueve' },
    '8': { value: 8, name: 'Ocho' },
    '7': { value: 7, name: 'Siete' },
    '6': { value: 6, name: 'Seis' },
    '5': { value: 5, name: 'Cinco' },
    '4': { value: 4, name: 'Cuatro' },
    '3': { value: 3, name: 'Tres' },
    '2': { value: 2, name: 'Dos' },
};

const CARD_SUIT: Record<string, { rank: number; name: string }> = {
    CLUBS: { rank: 1, name: 'tréboles' },
    DIAMONDS: { rank: 2, name: 'diamantes' },
    HEARTS: { rank: 3, name: 'corazones' },
    SPADES: { rank: 4, name: 'picas' },
};

/**
 * The persistent local mirror of API-backed decks (ADR 0006): PokéAPI (one GraphQL request
 * for the whole national dex) and Deck of Cards API (one draw of 52). Synced in the background
 * right after boot - never on the request path - and only when the pool is empty or older than
 * a week. Matches are then built from `CardPoolEntry` rows cached in memory, so gameplay never
 * waits on, or breaks because of, a third-party API.
 */
@Injectable()
export class CardPoolService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CardPoolService.name);
    private readonly families = new Map<RemoteSource, DeckEntity[][]>();
    private readonly syncing = new Map<RemoteSource, Promise<void>>();

    constructor(private readonly prisma: PrismaService) {}

    onApplicationBootstrap(): void {
        for (const source of ['pokeapi', 'deckofcards'] as const) {
            void this.syncIfStale(source);
        }
    }

    /** Quartet families (grouped by `quartetKey`) for a synced source; empty until synced. */
    async getFamilies(source: RemoteSource): Promise<DeckEntity[][]> {
        const cached = this.families.get(source);
        if (cached) return cached;

        const rows = await this.prisma.cardPoolEntry.findMany({
            where: { source },
            orderBy: [{ quartetKey: 'asc' }, { externalId: 'asc' }],
        });

        const grouped = new Map<string, DeckEntity[]>();
        for (const row of rows) {
            const members = grouped.get(row.quartetKey) ?? [];
            members.push({
                id: `${source}:${row.externalId}`,
                familyKey: `${source}:${row.quartetKey}`,
                name: row.name,
                imageUrl: row.imageUrl,
                stats: row.stats as Record<string, number>,
            });
            grouped.set(row.quartetKey, members);
        }

        const families = [...grouped.values()];
        if (families.length > 0) this.families.set(source, families);
        return families;
    }

    async count(source: RemoteSource): Promise<number> {
        return this.prisma.cardPoolEntry.count({ where: { source } });
    }

    isSyncing(source: RemoteSource): boolean {
        return this.syncing.has(source);
    }

    private async syncIfStale(source: RemoteSource): Promise<void> {
        try {
            const newest = await this.prisma.cardPoolEntry.findFirst({
                where: { source },
                orderBy: { syncedAt: 'desc' },
                select: { syncedAt: true },
            });

            if (newest && Date.now() - newest.syncedAt.getTime() < RESYNC_AFTER_MS) {
                this.logger.log(`Card pool "${source}" is fresh - serving it from the database.`);
                return;
            }

            await this.sync(source);
        } catch (error) {
            this.logger.warn(`Card pool "${source}" check failed: ${(error as Error).message}`);
        }
    }

    /** Full refresh of one source. Concurrent calls share the same in-flight sync. */
    sync(source: RemoteSource): Promise<void> {
        const running = this.syncing.get(source);
        if (running) return running;

        const job = (async () => {
            const started = Date.now();
            try {
                const entries =
                    source === 'pokeapi'
                        ? await this.fetchPokemon()
                        : await this.fetchPlayingCards();

                await this.prisma.$transaction([
                    this.prisma.cardPoolEntry.deleteMany({ where: { source } }),
                    this.prisma.cardPoolEntry.createMany({ data: entries }),
                ]);
                this.families.delete(source);
                this.logger.log(
                    `Card pool "${source}" synced: ${entries.length} cards in ${Date.now() - started} ms.`,
                );
            } catch (error) {
                this.logger.warn(
                    `Card pool "${source}" sync failed (${(error as Error).message}) - keeping what the database already has.`,
                );
            } finally {
                this.syncing.delete(source);
            }
        })();

        this.syncing.set(source, job);
        return job;
    }

    private async fetchPokemon(): Promise<Prisma.CardPoolEntryCreateManyInput[]> {
        const query = `query {
            pokemon_v2_pokemon(where: { is_default: { _eq: true }, id: { _lte: ${MAX_POKEMON_ID} } }, order_by: { id: asc }) {
                id
                name
                pokemon_v2_pokemonstats { base_stat pokemon_v2_stat { name } }
                pokemon_v2_pokemontypes(order_by: { slot: asc }) { pokemon_v2_type { name } }
                pokemon_v2_pokemonspecy {
                    pokemon_v2_pokemonspeciesnames(where: { language_id: { _eq: ${SPANISH_LANGUAGE_ID} } }) { name }
                }
            }
        }`;

        const response = await fetch(POKEAPI_GRAPHQL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`PokéAPI HTTP ${response.status}`);

        const body = (await response.json()) as { data?: { pokemon_v2_pokemon?: PokemonRow[] } };
        const rows = body.data?.pokemon_v2_pokemon ?? [];
        const entries: Prisma.CardPoolEntryCreateManyInput[] = [];

        for (const row of rows) {
            const type = row.pokemon_v2_pokemontypes[0]?.pokemon_v2_type.name;
            if (!type || !(type in POKEMON_TYPE_LABELS)) continue;

            const stats: Record<string, number> = {};
            for (const stat of row.pokemon_v2_pokemonstats) {
                stats[stat.pokemon_v2_stat.name] = stat.base_stat;
            }
            const required = [
                'hp',
                'attack',
                'defense',
                'speed',
                'special-attack',
                'special-defense',
            ];
            if (!required.every((key) => Number.isFinite(stats[key]))) continue;

            const spanish =
                row.pokemon_v2_pokemonspecy?.pokemon_v2_pokemonspeciesnames[0]?.name ??
                row.name.charAt(0).toUpperCase() + row.name.slice(1);

            entries.push({
                source: 'pokeapi',
                externalId: String(row.id).padStart(4, '0'),
                quartetKey: type,
                name: spanish,
                imageUrl: POKEMON_ARTWORK(row.id),
                stats,
            });
        }

        if (entries.length < 100) throw new Error(`only ${entries.length} Pokémon returned`);
        return entries;
    }

    private async fetchPlayingCards(): Promise<Prisma.CardPoolEntryCreateManyInput[]> {
        const response = await fetch(DECKOFCARDS_DRAW, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`deckofcardsapi HTTP ${response.status}`);

        const body = (await response.json()) as { cards?: DeckOfCardsCard[] };
        const entries: Prisma.CardPoolEntryCreateManyInput[] = [];

        for (const card of body.cards ?? []) {
            const value = CARD_VALUE[card.value];
            const suit = CARD_SUIT[card.suit];
            if (!value || !suit) continue;

            entries.push({
                source: 'deckofcards',
                externalId: card.code,
                quartetKey: card.value,
                name: `${value.name} de ${suit.name}`,
                imageUrl: card.images?.png ?? card.image,
                stats: { poder: value.value * 4 + suit.rank, valor: value.value, palo: suit.rank },
            });
        }

        if (entries.length !== 52) throw new Error(`expected 52 cards, got ${entries.length}`);
        return entries;
    }
}
