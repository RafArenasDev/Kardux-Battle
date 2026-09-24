import type { DeckEntity } from '@kardux/content';
import { POKEMON_TYPE_LABELS } from '@kardux/content';
import type { Prisma } from '@prisma/client';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { disabledDeckIds } from '../config/app-config.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';

export type RemoteSource = 'pokeapi';

export const REMOTE_SOURCES: readonly RemoteSource[] = ['pokeapi'];

const POKEAPI_GRAPHQL = 'https://beta.pokeapi.co/graphql/v1beta';
const POKEMON_ARTWORK = (id: number): string =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

/** Re-sync at most weekly; otherwise every boot is served straight from the database. */
const RESYNC_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const LANGUAGE_ES = 7;
const LANGUAGE_EN = 9;
/** Default forms of the national dex - excludes megas and regional variants. */
const MAX_POKEMON_ID = 1025;

interface PokemonRow {
    id: number;
    name: string;
    pokemon_v2_pokemonstats: { base_stat: number; pokemon_v2_stat: { name: string } }[];
    pokemon_v2_pokemontypes: { pokemon_v2_type: { name: string } }[];
    pokemon_v2_pokemonspecy: {
        pokemon_v2_pokemonspeciesnames: { name: string; language_id: number }[];
    } | null;
}

/**
 * Local mirror of the Pokémon deck: one PokéAPI GraphQL request for the whole national dex
 * (Spanish and English names, base stats, primary type). Synced in the background after boot -
 * never on the request path - and only when the pool is empty or older than a week. Matches are
 * built from these rows, cached in memory, so gameplay never waits on or breaks because of a
 * third-party API.
 */
@Injectable()
export class CardPoolService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CardPoolService.name);
    private readonly families = new Map<RemoteSource, DeckEntity[][]>();
    private readonly syncing = new Map<RemoteSource, Promise<void>>();

    constructor(private readonly prisma: PrismaService) {}

    onApplicationBootstrap(): void {
        const disabled = disabledDeckIds();
        for (const source of REMOTE_SOURCES) {
            if (disabled.has(source)) continue;
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
                nameEn: row.nameEn ?? row.name,
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

    private async syncIfStale(source: RemoteSource): Promise<void> {
        try {
            const newest = await this.prisma.cardPoolEntry.findFirst({
                where: { source },
                orderBy: { syncedAt: 'desc' },
                select: { syncedAt: true, nameEn: true },
            });

            const fresh = newest && Date.now() - newest.syncedAt.getTime() < RESYNC_AFTER_MS;
            // Rows synced before English names existed are refreshed right away.
            if (fresh && newest.nameEn !== null) {
                this.logger.log(`Card pool "${source}" is fresh - serving it from the database.`);
                return;
            }

            await this.sync(source);
        } catch (error) {
            this.logger.error(`Card pool "${source}" check failed: ${(error as Error).message}`);
        }
    }

    /** Full refresh of one source. Concurrent calls share the same in-flight sync. */
    sync(source: RemoteSource): Promise<void> {
        const running = this.syncing.get(source);
        if (running) return running;

        const job = (async () => {
            const started = Date.now();
            try {
                const entries = await this.fetch(source);
                await this.prisma.$transaction([
                    this.prisma.cardPoolEntry.deleteMany({ where: { source } }),
                    this.prisma.cardPoolEntry.createMany({ data: entries }),
                ]);
                this.families.delete(source);
                this.logger.log(
                    `Card pool "${source}" synced: ${entries.length} cards in ${Date.now() - started} ms.`,
                );
            } catch (error) {
                this.logger.error(
                    `Card pool "${source}" sync failed (${(error as Error).message}) - serving what the database already has.`,
                );
            } finally {
                this.syncing.delete(source);
            }
        })();

        this.syncing.set(source, job);
        return job;
    }

    private fetch(source: RemoteSource): Promise<Prisma.CardPoolEntryCreateManyInput[]> {
        switch (source) {
            case 'pokeapi':
                return this.fetchPokemon();
        }
    }

    private async getJson<T>(url: string, init?: RequestInit): Promise<T> {
        const response = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`${new URL(url).host} HTTP ${response.status}`);
        return (await response.json()) as T;
    }

    private async fetchPokemon(): Promise<Prisma.CardPoolEntryCreateManyInput[]> {
        const query = `query {
            pokemon_v2_pokemon(where: { is_default: { _eq: true }, id: { _lte: ${MAX_POKEMON_ID} } }, order_by: { id: asc }) {
                id
                name
                pokemon_v2_pokemonstats { base_stat pokemon_v2_stat { name } }
                pokemon_v2_pokemontypes(order_by: { slot: asc }) { pokemon_v2_type { name } }
                pokemon_v2_pokemonspecy {
                    pokemon_v2_pokemonspeciesnames(where: { language_id: { _in: [${LANGUAGE_ES}, ${LANGUAGE_EN}] } }) { name language_id }
                }
            }
        }`;

        const body = await this.getJson<{ data?: { pokemon_v2_pokemon?: PokemonRow[] } }>(
            POKEAPI_GRAPHQL,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ query }),
            },
        );
        const entries: Prisma.CardPoolEntryCreateManyInput[] = [];
        const required = ['hp', 'attack', 'defense', 'speed', 'special-attack', 'special-defense'];

        for (const row of body.data?.pokemon_v2_pokemon ?? []) {
            const type = row.pokemon_v2_pokemontypes[0]?.pokemon_v2_type.name;
            if (!type || !(type in POKEMON_TYPE_LABELS)) continue;

            const stats: Record<string, number> = {};
            for (const stat of row.pokemon_v2_pokemonstats) {
                stats[stat.pokemon_v2_stat.name] = stat.base_stat;
            }
            if (!required.every((key) => Number.isFinite(stats[key]))) continue;

            const names = row.pokemon_v2_pokemonspecy?.pokemon_v2_pokemonspeciesnames ?? [];
            const fallback = row.name.charAt(0).toUpperCase() + row.name.slice(1);

            entries.push({
                source: 'pokeapi',
                externalId: String(row.id).padStart(4, '0'),
                quartetKey: type,
                name: names.find((entry) => entry.language_id === LANGUAGE_ES)?.name ?? fallback,
                nameEn: names.find((entry) => entry.language_id === LANGUAGE_EN)?.name ?? fallback,
                imageUrl: POKEMON_ARTWORK(row.id),
                stats,
            });
        }

        if (entries.length < 100) throw new Error(`only ${entries.length} Pokémon returned`);
        return entries;
    }
}
