import { Injectable, Logger } from '@nestjs/common';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config.js';

/** One row of `manifest.json` in the `tcg-github-sync` repo - one synced deck/set. */
export interface GithubSyncManifestEntry {
    source: string;
    tcg: string | null;
    deck: string;
    name: string;
    count: number;
    path: string;
}

export interface GithubSyncManifest {
    decks: GithubSyncManifestEntry[];
}

/** Shape every entity in every deck JSON is normalized to by that repo's own `sync.py` -
 *  see its `tcg_sync/exporter.py`. `attributes` varies per source/deck and is not further
 *  typed here; `DeckService` only reads `name`/`image` for previews today. */
export interface GithubSyncCard {
    source: string;
    deck: string;
    id: string | number;
    name: string;
    image: { small: string; medium: string; large: string };
    attributes: Record<string, unknown>;
}

const MANIFEST_TTL_MS = 5 * 60 * 1000;
const DECK_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

/**
 * Reads the card data `tcg-github-sync` (github.com/FlakoArenas26/tcg-github-sync, a
 * separate repo/process this game's sync job feeds) already synced and committed as JSON,
 * served for free over the GitHub raw CDN - no API key, no per-request rate limit like the
 * original per-source APIs (`pokeapi.co`, etc.) would have. This replaces the previously
 * hardcoded `DECK_SOURCES` catalog in `deck.service.ts`.
 *
 * In-memory TTL cache only (no Redis/`CardPoolEntry` yet - that's ADR 0006's fuller design,
 * still Phase 3): fine for a catalog endpoint, wrong once real deck-building reads this on
 * the match-create hot path.
 */
@Injectable()
export class GithubSyncClient {
    private readonly logger = new Logger(GithubSyncClient.name);
    private readonly baseUrl: string;
    private manifestCache?: CacheEntry<GithubSyncManifest>;
    private readonly deckCache = new Map<string, CacheEntry<GithubSyncCard[]>>();

    constructor(config: ConfigService<AppConfig, true>) {
        this.baseUrl = config.get('GITHUB_SYNC_BASE_URL', { infer: true });
    }

    async getManifest(): Promise<GithubSyncManifest | undefined> {
        if (this.manifestCache && this.manifestCache.expiresAt > Date.now()) {
            return this.manifestCache.value;
        }

        const value = await this.fetchJson<GithubSyncManifest>('manifest.json');
        if (value) {
            this.manifestCache = { value, expiresAt: Date.now() + MANIFEST_TTL_MS };
            return value;
        }

        // Upstream fetch failed - serve the last known-good manifest if we have one rather
        // than failing the whole catalog endpoint over a transient GitHub hiccup.
        return this.manifestCache?.value;
    }

    async getDeck(path: string): Promise<GithubSyncCard[] | undefined> {
        const cached = this.deckCache.get(path);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value;
        }

        // Manifest paths are repo-root-relative ("data/pokeapi/pokemon.json") but `baseUrl`
        // already ends in "/data" - strip the duplicate segment before appending.
        const relativePath = path.replace(/^data\//, '');
        const value = await this.fetchJson<GithubSyncCard[]>(relativePath);
        if (value) {
            this.deckCache.set(path, { value, expiresAt: Date.now() + DECK_TTL_MS });
            return value;
        }

        return cached?.value;
    }

    private async fetchJson<T>(relativePath: string): Promise<T | undefined> {
        const url = `${this.baseUrl}/${relativePath}`;
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return (await response.json()) as T;
        } catch (error) {
            this.logger.warn(
                `Failed to fetch ${url} from tcg-github-sync: ${(error as Error).message}`,
            );
            return undefined;
        }
    }
}
