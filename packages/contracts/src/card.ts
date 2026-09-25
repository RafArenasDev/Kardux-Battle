import { z } from 'zod';

/**
 * Deck sources the game can build a match from. Kardux plays a single deck: the Pokémon cards
 * mirrored from PokéAPI into `card_pool_entries`. It is still modeled as an enum (and
 * `MatchConfig.deckSources` as a list) so adding another source later is a data change, not a
 * contract change.
 */
export const DECK_SOURCE_IDS = ['pokeapi'] as const;

export type DeckSourceId = (typeof DECK_SOURCE_IDS)[number];

export const deckSourceIdSchema = z.enum(DECK_SOURCE_IDS);

/**
 * Describes one comparable attribute of a deck (e.g. "hp", "attack"). `higherIsBetter` is
 * always true for the Pokémon deck, but it's still a real field (not a
 * hardcoded assumption in the engine) so a future provider with a "lower is better" stat
 * (e.g. lap time) doesn't need an engine change.
 */
export const attributeDefSchema = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    unit: z.string().optional(),
    higherIsBetter: z.boolean(),
});

export type AttributeDef = z.infer<typeof attributeDefSchema>;

/**
 * A single card. `code` is the canonical "1A" style identifier from docs/SPEC.md; `quartet` is
 * just the letter part, kept separate because the engine and the DeckBuilder both need to
 * group cards by quartet without re-parsing `code` every time.
 */
export const cardSchema = z.object({
    code: z.string().regex(/^\d+[A-Z]$/, 'Card code must look like "1A", "12C", etc.'),
    quartet: z.string().regex(/^[A-Z]$/, 'Quartet must be a single uppercase letter.'),
    name: z.string().min(1),
    /** English name, when the source provides one (`name` is the Spanish name). */
    nameEn: z.string().min(1).optional(),
    imageUrl: z.string().url(),
    source: deckSourceIdSchema,
    /**
     * Same attribute keys across every card in a deck - enforced when the deck is
     * built (`apps/api/src/deck`), not re-validated per-card here since a single card in
     * isolation has no way to know what the rest of the deck looks like.
     */
    stats: z.record(z.string(), z.number()),
});

export type Card = z.infer<typeof cardSchema>;
