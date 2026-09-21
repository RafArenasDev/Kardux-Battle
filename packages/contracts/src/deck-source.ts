import { attributeDefSchema, deckSourceIdSchema } from './card.js';
import { z } from 'zod';

/**
 * Catalog entry for one deck source: what `GET /decks/sources` returns. This is metadata
 * only - it never calls the source's external API. `ready` distinguishes the sources that
 * `packages/providers` (TASK-02, not built yet) can actually build a deck from today versus
 * the ones that are only valid `DeckSourceId`s reserved for later (CLAUDE.md's provider
 * table). Only `local` (the embedded seed deck used for dev/tests) is `ready: true` right
 * now; every external-API-backed source is still catalog/`ready: false` until its provider
 * ships.
 */
export const deckSourceDescriptorSchema = z.object({
    id: deckSourceIdSchema,
    label: z.string().min(1),
    attributes: z.array(attributeDefSchema),
    /** True when building a deck from this source requires an API key the operator must
     *  provision (e.g. `marvel`'s free-tier key) - surfaced so the lobby UI can warn/hide
     *  the option instead of failing at match-create time. */
    requiresApiKey: z.boolean(),
    /** True only for sources `packages/providers` can actually build a deck from today. */
    ready: z.boolean(),
});

export type DeckSourceDescriptor = z.infer<typeof deckSourceDescriptorSchema>;

export const deckSourceListSchema = z.array(deckSourceDescriptorSchema);

export type DeckSourceList = z.infer<typeof deckSourceListSchema>;
