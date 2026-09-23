import { z } from 'zod';

/**
 * Every deck provider docs/SPEC.md documents, plus `deckofcards` and `apitcg` - the two extra
 * sources the `tcg-github-sync` mirror (github.com/FlakoArenas26/tcg-github-sync) actually
 * syncs data for today (see `docs/PENDING-WORK.md`'s "tcg-github-sync data status" entry).
 * `dragonball`, `naruto`, `digimon`, `rickmorty`, `swapi`, `superheroes`, `marvel`, and
 * `transformers` are still valid identifiers reserved for `TASK-02-providers.md`'s original
 * per-source-API plan, but nothing syncs data for them yet - `DeckService` reports them as
 * `ready: false`.
 */
export const DECK_SOURCE_IDS = [
    'mythic',
    'paises',
    'autos',
    'motos',
    'aviones',
    'fauna',
    'naipes',
    'local',
    'pokeapi',
    'deckofcards',
    'apitcg',
    'dragonball',
    'naruto',
    'digimon',
    'rickmorty',
    'swapi',
    'superheroes',
    'marvel',
    'transformers',
] as const;

export type DeckSourceId = (typeof DECK_SOURCE_IDS)[number];

export const deckSourceIdSchema = z.enum(DECK_SOURCE_IDS);

/**
 * Describes one comparable attribute of a deck (e.g. "hp", "attack"). `higherIsBetter` is
 * always true for every provider in `docs/SPEC.md` today, but it's still a real field (not a
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
     * Same attribute keys across every card in a deck - enforced by DeckBuilder
     * (`packages/providers`, TASK-02), not re-validated per-card here since a single card in
     * isolation has no way to know what the rest of the deck looks like.
     */
    stats: z.record(z.string(), z.number()),
});

export type Card = z.infer<typeof cardSchema>;
