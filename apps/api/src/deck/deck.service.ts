import type { DeckPreviewCard, DeckSourceDescriptor, DeckSourceId } from '@kardux/contracts';
import { Injectable } from '@nestjs/common';
import type { GithubSyncManifestEntry } from './github-sync.client.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GithubSyncClient } from './github-sync.client.js';

/**
 * Attribute metadata for the sources `tcg-github-sync` actually has data for, keyed by the
 *  manifest's `source` field. Not every `DeckSourceId` synced there has a fixed attribute
 *  set yet (`apitcg` covers many not-yet-normalized TCGs) - `HP` is the one numeric field
 *  every apitcg Pokémon card shares today. */
const SYNCED_SOURCE_META: Record<
    string,
    Pick<DeckSourceDescriptor, 'label' | 'attributes' | 'requiresApiKey'>
> = {
    pokeapi: {
        label: 'Pokémon',
        attributes: [
            { key: 'hp', label: 'HP', higherIsBetter: true },
            { key: 'attack', label: 'Attack', higherIsBetter: true },
            { key: 'defense', label: 'Defense', higherIsBetter: true },
            { key: 'speed', label: 'Speed', higherIsBetter: true },
            { key: 'special-attack', label: 'Special Attack', higherIsBetter: true },
            { key: 'weight', label: 'Weight', unit: 'kg', higherIsBetter: true },
        ],
        requiresApiKey: false,
    },
    deckofcards: {
        label: 'Standard playing cards',
        attributes: [{ key: 'rank', label: 'Rank', higherIsBetter: true }],
        requiresApiKey: false,
    },
    apitcg: {
        label: 'Pokémon TCG (apitcg.com sets)',
        attributes: [{ key: 'hp', label: 'HP', higherIsBetter: true }],
        requiresApiKey: false,
    },
};

@Injectable()
export class DeckService {
    constructor(private readonly githubSync: GithubSyncClient) {}

    /**
     * Returns exactly the sources the `tcg-github-sync` manifest reports right now - nothing
     * invented. No placeholder rows for `local` or for the rest of CLAUDE.md's original
     * per-source-API table (`dragonball`, `naruto`, ...): none of them have synced data, so
     * they don't appear here at all until a real provider exists for them. If the manifest
     * fetch itself fails, this returns whatever was last cached (`GithubSyncClient`), or `[]`
     * on a cold start with no network - never a fabricated catalog entry.
     */
    async listSources(): Promise<DeckSourceDescriptor[]> {
        const manifest = await this.githubSync.getManifest();
        return this.buildSyncedDescriptors(manifest?.decks ?? []);
    }

    private async buildSyncedDescriptors(
        entries: GithubSyncManifestEntry[],
    ): Promise<DeckSourceDescriptor[]> {
        const bySource = new Map<string, GithubSyncManifestEntry[]>();
        for (const entry of entries) {
            const bucket = bySource.get(entry.source) ?? [];
            bucket.push(entry);
            bySource.set(entry.source, bucket);
        }

        const descriptors: DeckSourceDescriptor[] = [];
        for (const [source, group] of bySource) {
            const meta = SYNCED_SOURCE_META[source];
            if (!meta || !isDeckSourceId(source)) {
                // A source the sync repo knows about but this game hasn't mapped attributes
                // for yet - skip rather than guess at comparable stats.
                continue;
            }

            const cardCount = group.reduce((sum, deck) => sum + deck.count, 0);
            const preview = await this.buildPreview(group);

            descriptors.push({
                id: source,
                label: meta.label,
                attributes: meta.attributes,
                requiresApiKey: meta.requiresApiKey,
                ready: cardCount > 0,
                cardCount,
                preview,
            });
        }

        return descriptors;
    }

    private async buildPreview(group: GithubSyncManifestEntry[]): Promise<DeckPreviewCard[]> {
        // Biggest deck first - a more representative sample than whichever synced first.
        const [largest] = [...group].sort((a, b) => b.count - a.count);
        if (!largest) {
            return [];
        }

        const cards = await this.githubSync.getDeck(largest.path);
        return (cards ?? []).slice(0, 4).map((card) => ({
            name: card.name,
            imageUrl: card.image.medium || card.image.small || card.image.large,
        }));
    }
}

function isDeckSourceId(value: string): value is DeckSourceId {
    return value in SYNCED_SOURCE_META;
}
