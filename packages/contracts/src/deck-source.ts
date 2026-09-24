import { deckSourceIdSchema } from './card.js';
import { z } from 'zod';

/** Text shipped in both supported languages. */
export const localizedTextSchema = z.object({
    es: z.string().describe('Spanish text.'),
    en: z.string().describe('English text.'),
});

export type LocalizedTextDto = z.infer<typeof localizedTextSchema>;

/** One comparable attribute of a deck, labelled in both languages. */
export const deckAttributeSchema = z.object({
    key: z
        .string()
        .min(1)
        .describe('Stable attribute key used in `round:selectAttribute`, e.g. "attack".'),
    label: localizedTextSchema,
    unit: z.string().optional().describe('Display unit, e.g. "km/h".'),
    higherIsBetter: z.boolean(),
});

/** A few real cards from the synced pool, so the lobby can show the deck's actual art. */
export const deckPreviewCardSchema = z.object({
    name: z.string().min(1),
    imageUrl: z.string().url(),
});

export type DeckPreviewCard = z.infer<typeof deckPreviewCardSchema>;

/**
 * Catalog entry for one deck source: what `GET /decks/sources` returns. `ready` turns true
 * once the card pool for that source has been synced into the database at least once.
 */
export const deckSourceDescriptorSchema = z.object({
    id: deckSourceIdSchema,
    label: localizedTextSchema,
    attributes: z.array(deckAttributeSchema),
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
    /** Short one-line pitch shown under the deck name in the lobby. */
    tagline: localizedTextSchema,
    description: localizedTextSchema,
    credits: localizedTextSchema
        .nullable()
        .describe('Attribution required by the data source, if any.'),
    /** Accent color for the deck tile (CSS color). */
    accent: z.string(),
    /** Upper bounds the lobby form must respect for this deck. */
    maxPacks: z.number().int().positive(),
    maxCardsPerPack: z.number().int().positive(),
});

export type DeckSourceDescriptor = z.infer<typeof deckSourceDescriptorSchema>;

export const deckSourceListSchema = z.array(deckSourceDescriptorSchema);

export type DeckSourceList = z.infer<typeof deckSourceListSchema>;
