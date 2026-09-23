import { attributeDefSchema, deckSourceIdSchema } from './card.js';
import { z } from 'zod';

/**
 * A tiny, real sample of a source's synced data - used by `GET /decks/sources` so a lobby UI
 * (or Swagger) can show actual card names/art instead of trusting the `ready` flag blindly.
 * Only present for sources `DeckService` pulled from the `tcg-github-sync` manifest.
 */
export const deckPreviewCardSchema = z.object({
    name: z.string().min(1),
    imageUrl: z.string().url(),
});

export type DeckPreviewCard = z.infer<typeof deckPreviewCardSchema>;

/**
 * Catalog entry for one deck source: what `GET /decks/sources` returns. `ready: true` means
 * `DeckService` resolved this source against the live `tcg-github-sync` manifest and got back
 * real, synced data (`cardCount`/`preview` reflect that fetch) - not that a full `DeckBuilder`
 * exists yet (`packages/providers`/TASK-02, still not built). `ready: false` sources are pure
 * catalog metadata from CLAUDE.md's original provider table: no sync job covers them.
 */
export const deckSourceDescriptorSchema = z.object({
    id: deckSourceIdSchema,
    label: z.string().min(1),
    attributes: z.array(attributeDefSchema),
    /** True when building a deck from this source requires an API key the operator must
     *  provision (e.g. `marvel`'s free-tier key) - surfaced so the lobby UI can warn/hide
     *  the option instead of failing at match-create time. */
    requiresApiKey: z.boolean(),
    /** True only for sources with real synced data available right now. */
    ready: z.boolean(),
    /** Total cards/entities currently synced for this source. `0` when `ready` is `false`. */
    cardCount: z.number().int().nonnegative(),
    /** Up to 4 real sample cards pulled from the synced data. Empty when `ready` is `false`. */
    preview: z.array(deckPreviewCardSchema).max(4),
});

export type DeckSourceDescriptor = z.infer<typeof deckSourceDescriptorSchema>;

export const deckSourceListSchema = z.array(deckSourceDescriptorSchema);

export type DeckSourceList = z.infer<typeof deckSourceListSchema>;
