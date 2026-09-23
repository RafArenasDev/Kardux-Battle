import type { Card, DeckSourceId, MatchConfig } from '@kardux/contracts';
import { createRngState, shuffle } from '@kardux/engine';
import { Injectable, Logger } from '@nestjs/common';
import type { GithubSyncCard, GithubSyncManifestEntry } from './github-sync.client.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GithubSyncClient } from './github-sync.client.js';
import { KarduxError } from '../common/kardux-error.js';

/** A..Z - `cardsPerPack`'s schema max (26) is deliberately the alphabet's size, so a quartet
 *  letter never needs to wrap or double up. */
const QUARTET_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/** One normalized entity, before it's sliced down to the match's chosen attribute subset and
 *  stamped with a `code`/`quartet`. `id` only needs to be unique within its own source. */
interface Candidate {
    id: string;
    name: string;
    imageUrl: string;
    source: DeckSourceId;
    /** Every numeric stat this candidate could offer - a superset of what any single match
     *  actually uses, so `DeckBuilder` can pick whichever `attributeCount` keys the sources in
     *  play have in common. */
    stats: Record<string, number>;
}

/** Which numeric attribute keys a source can offer at all, and in what priority order to
 *  offer them (first `attributeCount` of this list, once intersected with every other source
 *  in play). Mirrors `DeckService`'s `SYNCED_SOURCE_META` - kept separate because that map is
 *  about *describing* a source for the catalog endpoint, this one is about *building* a deck
 *  from it, and the two call sites don't share a constructor. */
const SOURCE_ATTRIBUTE_ORDER: Record<DeckSourceId, readonly string[]> = {
    local: ['power', 'defense', 'speed', 'magic', 'luck', 'stamina'],
    pokeapi: ['hp', 'attack', 'defense', 'speed', 'special-attack', 'weight'],
    deckofcards: ['rank', 'suitRank', 'highCardBonus'],
    apitcg: ['hp'],
    dragonball: [],
    naruto: [],
    digimon: [],
    rickmorty: [],
    swapi: [],
    superheroes: [],
    marvel: [],
    transformers: [],
};

const LOCAL_FAMILY_NAMES = [
    'Dragón',
    'Fénix',
    'Lobo',
    'Tigre',
    'Águila',
    'Serpiente',
    'Oso',
    'Halcón',
    'Grifo',
    'Kraken',
    'Basilisco',
    'Quimera',
    'Hidra',
    'Minotauro',
    'Centauro',
    'Pegaso',
    'Unicornio',
    'Gólem',
    'Trol',
    'Ogro',
    'Vampiro',
    'Licántropo',
    'Espectro',
    'Demonio',
    'Ángel',
    'Titán',
];

/** Inline, deterministic SVG "card back" per quartet letter - no network round-trip, so the
 *  `local` source (the match config's default `deckSources`) never depends on connectivity or
 *  an external image host. Colors cycle through a small hand-picked palette; there's no
 *  per-project design token shared with `apps/web` at this layer, so this stays a self
 *  contained constant instead of importing one. */
const LOCAL_PALETTE = [
    '#f2b441',
    '#2dd4a7',
    '#ef4a5a',
    '#7c8aa5',
    '#c084fc',
    '#38bdf8',
    '#fb923c',
    '#facc15',
];

function localCardImage(letterIndex: number, familyName: string): string {
    const color = LOCAL_PALETTE[letterIndex % LOCAL_PALETTE.length];
    const initial = familyName.charAt(0);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280">` +
        `<rect width="200" height="280" rx="16" fill="${color}"/>` +
        `<text x="100" y="160" font-size="96" font-family="sans-serif" font-weight="700" ` +
        `fill="#0b1020" text-anchor="middle">${initial}</text>` +
        `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Deterministic string -> unsigned 32-bit int hash (FNV-1a), used only to derive a stable
 *  numeric stat from an id/name when a real value is missing - never `NaN`, per CLAUDE.md's
 *  hard rule for providers. */
function hashToRange(seed: string, min: number, max: number): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    const unsigned = hash >>> 0;
    return min + (unsigned % (max - min + 1));
}

function toFiniteNumber(value: unknown): number | undefined {
    const num = typeof value === 'string' ? Number.parseFloat(value) : (value as number);
    return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

const DECKOFCARDS_RANK: Record<string, number> = {
    A: 14,
    K: 13,
    Q: 12,
    J: 11,
    '0': 10, // deckofcardsapi.com's own convention for "10".
};

const DECKOFCARDS_SUIT_RANK: Record<string, number> = {
    CLUBS: 1,
    DIAMONDS: 2,
    HEARTS: 3,
    SPADES: 4,
};

/**
 * Turns one raw `tcg-github-sync` entity into a `Candidate`, or `undefined` to discard it
 * (CLAUDE.md: "rechazar entidades sin imagen"; a value that can't be parsed to a real number
 * is discarded here too rather than risk a `NaN` slipping into `Card.stats`).
 */
function normalizeSyncedCard(
    source: 'pokeapi' | 'deckofcards' | 'apitcg',
    raw: GithubSyncCard,
): Candidate | undefined {
    const imageUrl = raw.image.medium || raw.image.small || raw.image.large;
    if (!imageUrl) return undefined;

    if (source === 'pokeapi') {
        const rawStats = (raw.attributes as { stats?: Record<string, unknown> }).stats ?? {};
        const stats: Record<string, number> = {};
        for (const key of ['hp', 'attack', 'defense', 'speed', 'special-attack']) {
            const value = toFiniteNumber(rawStats[key]);
            if (value === undefined) return undefined;
            stats[key] = value;
        }
        const weight = toFiniteNumber(raw.attributes.weight);
        if (weight === undefined) return undefined;
        stats.weight = weight;

        return { id: String(raw.id), name: raw.name, imageUrl, source, stats };
    }

    if (source === 'deckofcards') {
        const rawValue = String((raw.attributes as { value?: unknown }).value ?? '');
        const rank = DECKOFCARDS_RANK[rawValue] ?? toFiniteNumber(rawValue);
        if (rank === undefined) return undefined;

        const suit = String((raw.attributes as { suit?: unknown }).suit ?? '').toUpperCase();
        const suitRank = DECKOFCARDS_SUIT_RANK[suit];
        if (suitRank === undefined) return undefined;

        const stats = { rank, suitRank, highCardBonus: rank >= 11 ? rank : 0 };

        return { id: String(raw.id), name: raw.name, imageUrl, source, stats };
    }

    // apitcg: a loose bag of set-specific string fields. Only `HP` is universal enough to
    // trust - Trainer/Energy cards don't have one at all and are correctly discarded here,
    // not padded with a fabricated value.
    const hp = toFiniteNumber((raw.attributes as { HP?: unknown }).HP);
    if (hp === undefined) return undefined;

    return { id: String(raw.id), name: raw.name, imageUrl, source, stats: { hp } };
}

export interface BuildDeckOptions {
    seed: string;
}

/**
 * Builds the real, playable `Card[]` for a match from
 * `MatchConfig.{deckSources,packs,cardsPerPack,attributeCount,mixSources}` - the piece CLAUDE.md
 * calls `DeckProvider.build()` / `DeckBuilder.build()`. Unlike the catalog-only path in
 * `DeckService` (which just reports what's synced), this samples real entities and stamps them
 * with the `<number><letter>` card codes `@kardux/engine` expects.
 *
 * `local` needs no network at all (a small deterministic synthetic deck - CLAUDE.md's own
 * "Añadir un provider `local` con un mazo semilla embebido para desarrollo y tests offline"),
 * so a fresh clone with no connectivity can still create and play a match with the config's
 * own default (`deckSources: ['local']`).
 */
@Injectable()
export class DeckBuilder {
    private readonly logger = new Logger(DeckBuilder.name);

    constructor(private readonly githubSync: GithubSyncClient) {}

    async build(
        config: Pick<
            MatchConfig,
            'deckSources' | 'packs' | 'cardsPerPack' | 'attributeCount' | 'mixSources'
        >,
        options: BuildDeckOptions,
    ): Promise<Card[]> {
        const totalNeeded = config.packs * config.cardsPerPack;
        const attributeKeys = this.pickAttributeKeys(config.deckSources, config.attributeCount);

        const pools = await Promise.all(
            config.deckSources.map((source) => this.buildCandidatePool(source, totalNeeded)),
        );
        const candidates = pools.flat();

        if (candidates.length < totalNeeded) {
            throw new KarduxError(
                'ERR_INVALID_CONFIG',
                `Only ${candidates.length} usable card(s) are available from ${config.deckSources.join(', ')} ` +
                    `- need ${totalNeeded} (packs x cardsPerPack). Lower packs/cardsPerPack or pick a bigger source.`,
            );
        }

        const [shuffled] = shuffle(candidates, createRngState(`${options.seed}:deck`));
        const chosen = shuffled.slice(0, totalNeeded);

        return chosen.map((candidate, index) => {
            const letterIndex = index % config.cardsPerPack;
            const packNumber = Math.floor(index / config.cardsPerPack) + 1;
            const stats: Record<string, number> = {};
            for (const key of attributeKeys) {
                stats[key] = candidate.stats[key] ?? hashToRange(`${candidate.id}:${key}`, 1, 99);
            }

            return {
                code: `${packNumber}${QUARTET_LETTERS[letterIndex]}`,
                quartet: QUARTET_LETTERS[letterIndex]!,
                name: candidate.name,
                imageUrl: candidate.imageUrl,
                source: candidate.source,
                stats,
            };
        });
    }

    /** The attribute keys every card in the deck will share: the first `attributeCount` keys
     *  common to every requested source's `SOURCE_ATTRIBUTE_ORDER`. Throws a clear, actionable
     *  `ERR_INVALID_CONFIG` instead of silently padding with a fake stat - some real sources
     *  (`apitcg`: HP only, `deckofcards`: 3 derived stats) genuinely can't fill every
     *  `attributeCount` from 3 to 6 the way `pokeapi`/`local` can. */
    private pickAttributeKeys(sources: readonly DeckSourceId[], attributeCount: number): string[] {
        let common: string[] | undefined;
        for (const source of sources) {
            const available = SOURCE_ATTRIBUTE_ORDER[source] ?? [];
            common =
                common === undefined
                    ? [...available]
                    : common.filter((key) => available.includes(key));
        }
        const keys = (common ?? []).slice(0, attributeCount);

        if (keys.length < attributeCount) {
            throw new KarduxError(
                'ERR_INVALID_CONFIG',
                `${sources.join('+')} can only offer ${keys.length} shared numeric attribute(s), ` +
                    `but attributeCount is ${attributeCount}. Lower attributeCount or choose a richer ` +
                    `source (e.g. "pokeapi" or "local" offer up to 6).`,
            );
        }

        return keys;
    }

    private async buildCandidatePool(
        source: DeckSourceId,
        totalNeeded: number,
    ): Promise<Candidate[]> {
        if (source === 'local') {
            return this.buildLocalPool(totalNeeded);
        }

        if (source !== 'pokeapi' && source !== 'deckofcards' && source !== 'apitcg') {
            throw new KarduxError(
                'ERR_INVALID_CONFIG',
                `Deck source "${source}" has no synced data yet (see docs/PENDING-WORK.md).`,
            );
        }

        const manifest = await this.githubSync.getManifest();
        const entries = (manifest?.decks ?? []).filter(
            (entry: GithubSyncManifestEntry) => entry.source === source,
        );

        if (entries.length === 0) {
            throw new KarduxError(
                'ERR_INVALID_CONFIG',
                `Deck source "${source}" has no synced data available right now.`,
            );
        }

        const rawCards = (
            await Promise.all(entries.map((entry) => this.githubSync.getDeck(entry.path)))
        ).flatMap((cards) => cards ?? []);

        const candidates: Candidate[] = [];
        for (const raw of rawCards) {
            const candidate = normalizeSyncedCard(source, raw);
            if (candidate) candidates.push(candidate);
        }

        if (candidates.length === 0) {
            this.logger.warn(`No usable candidates normalized from source "${source}".`);
        }

        return candidates;
    }

    /** A small, fully offline synthetic deck - deterministic per-entity stats derived from a
     *  hash of its own id, never from `Math.random()`/`Date.now()` (kept consistent with the
     *  engine's own no-nondeterminism rule, even though this runs outside the engine itself). */
    private buildLocalPool(totalNeeded: number): Candidate[] {
        const count = Math.max(totalNeeded, LOCAL_FAMILY_NAMES.length * 4);
        const candidates: Candidate[] = [];

        for (let i = 0; i < count; i++) {
            const familyIndex = i % LOCAL_FAMILY_NAMES.length;
            const family = LOCAL_FAMILY_NAMES[familyIndex]!;
            const id = `local-${i}`;
            const stats: Record<string, number> = {};
            for (const key of SOURCE_ATTRIBUTE_ORDER.local) {
                stats[key] = hashToRange(`${id}:${key}`, 10, 99);
            }

            candidates.push({
                id,
                name: `${family} ${Math.floor(i / LOCAL_FAMILY_NAMES.length) + 1}`,
                imageUrl: localCardImage(familyIndex, family),
                source: 'local',
                stats,
            });
        }

        return candidates;
    }
}
