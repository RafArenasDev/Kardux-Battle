import type { DeckSourceId, MatchConfig } from '@kardux/contracts';
import { renderCardArt } from '../art.js';
import { hashString } from '../avatars.js';
import type { IconName } from '../icons.generated.js';
import { MOTORES_DECK } from './motores.js';
import { MYTHIC_DECK } from './mythic.js';
import { NAIPES_DECK } from './naipes.js';
import { POKEMON_DECK, POKER_DECK } from './remote.js';
import type { DeckAttribute, DeckDefinition, DeckEntity, DeckFamily } from './types.js';

export type { DeckAttribute, DeckDefinition, DeckEntity, DeckFamily, DeckMember } from './types.js';
export type { RemoteDeckMeta } from './remote.js';
export { POKEMON_DECK, POKER_DECK, POKEMON_TYPE_LABELS, REMOTE_DECKS } from './remote.js';

/** Bundled decks with their own families (and art). `naipes` is not listed in the catalog: it
 *  is the offline fallback for the poker deck when deckofcardsapi hasn't synced yet. */
export const BUNDLED_DECKS: readonly DeckDefinition[] = [MOTORES_DECK, MYTHIC_DECK, NAIPES_DECK];

export interface DeckLimits {
    /** Max `packs`: every quartet needs one card per pack. */
    maxPacks: number;
    /** Max `cardsPerPack`: the number of distinct families. */
    maxCardsPerPack: number;
    maxAttributes: number;
}

/** What the lobby needs to know about any playable deck, bundled or synced. */
export interface DeckInfo {
    id: DeckSourceId;
    kind: 'remote' | 'bundled';
    label: string;
    tagline: string;
    description: string;
    coverIcon: IconName;
    accent: string;
    attributes: readonly DeckAttribute[];
    credits?: string;
    limits: DeckLimits;
}

export function deckLimits(deck: DeckDefinition): DeckLimits {
    return {
        maxPacks: Math.min(...deck.families.map((family) => family.members.length)),
        maxCardsPerPack: deck.families.length,
        maxAttributes: deck.attributes.length,
    };
}

function bundledInfo(deck: DeckDefinition): DeckInfo {
    return {
        id: deck.id,
        kind: 'bundled',
        label: deck.label,
        tagline: deck.tagline,
        description: deck.description,
        coverIcon: deck.coverIcon,
        accent: deck.accent,
        attributes: deck.attributes,
        limits: deckLimits(deck),
    };
}

/** Every deck a player can pick for a *card battle* (attribute comparison). The poker deck is
 *  deliberately NOT here: playing cards follow casino rules (poker, 21, rummy, baccarat), which
 *  is a separate game mode with its own engine - see docs/casino-mode.md. `POKER_DECK` stays
 *  exported for that mode, and `getDeckInfo('deckofcards')` still resolves for old matches. */
export const DECK_CATALOG: readonly DeckInfo[] = [
    ...[POKEMON_DECK].map((meta): DeckInfo => ({
        id: meta.id,
        kind: 'remote',
        label: meta.label,
        tagline: meta.tagline,
        description: meta.description,
        coverIcon: meta.coverIcon,
        accent: meta.accent,
        attributes: meta.attributes,
        credits: meta.credits,
        limits: {
            maxPacks: meta.maxPacks,
            maxCardsPerPack: meta.maxCardsPerPack,
            maxAttributes: meta.attributes.length,
        },
    })),
    bundledInfo(MOTORES_DECK),
    bundledInfo(MYTHIC_DECK),
];

/** Metadata for any deck id, including the unlisted `naipes`/`local` fallbacks. */
export function getDeckInfo(id: DeckSourceId): DeckInfo | undefined {
    const listed = DECK_CATALOG.find((deck) => deck.id === id);
    if (listed) return listed;
    if (id === 'deckofcards') {
        return {
            id: POKER_DECK.id,
            kind: 'remote',
            label: POKER_DECK.label,
            tagline: POKER_DECK.tagline,
            description: POKER_DECK.description,
            coverIcon: POKER_DECK.coverIcon,
            accent: POKER_DECK.accent,
            attributes: POKER_DECK.attributes,
            credits: POKER_DECK.credits,
            limits: {
                maxPacks: POKER_DECK.maxPacks,
                maxCardsPerPack: POKER_DECK.maxCardsPerPack,
                maxAttributes: POKER_DECK.attributes.length,
            },
        };
    }
    const bundled = getDeck(id);
    return bundled ? bundledInfo(bundled) : undefined;
}

/** Bundled deck definition. `local` is the historical offline/dev id - it plays the mythic
 *  deck so older configs (and the engine's tests) keep working. */
export function getDeck(id: DeckSourceId): DeckDefinition | undefined {
    if (id === 'local') return MYTHIC_DECK;
    return BUNDLED_DECKS.find((deck) => deck.id === id);
}

/** Attributes shared by every selected deck, in the first deck's priority order. */
export function sharedAttributes(
    decks: readonly { attributes: readonly DeckAttribute[] }[],
): DeckAttribute[] {
    const [first, ...rest] = decks;
    if (!first) return [];
    return first.attributes.filter((attribute) =>
        rest.every((deck) => deck.attributes.some((other) => other.key === attribute.key)),
    );
}

type DeckConfig = Pick<
    MatchConfig,
    'deckSources' | 'packs' | 'cardsPerPack' | 'attributeCount' | 'maxPlayers'
>;

/** Human-readable (Spanish) reason a config can't be built, or `null` when it can. Shared by
 *  the API (rejects the request) and the web form (disables "Crear"). */
export function validateDeckConfig(config: DeckConfig): string | null {
    const decks: DeckInfo[] = [];
    for (const id of config.deckSources) {
        const deck = getDeckInfo(id);
        if (!deck) return `El mazo "${id}" no está disponible.`;
        decks.push(deck);
    }

    const attributes = sharedAttributes(decks);
    if (attributes.length < config.attributeCount) {
        return `Este mazo solo ofrece ${attributes.length} atributos comparables; baja la cantidad de atributos.`;
    }

    const maxPacks = Math.min(...decks.map((deck) => deck.limits.maxPacks));
    if (config.packs > maxPacks) {
        return `Este mazo admite como máximo ${maxPacks} paquetes.`;
    }

    const maxFamilies = decks.reduce((sum, deck) => sum + deck.limits.maxCardsPerPack, 0);
    if (config.cardsPerPack > maxFamilies) {
        return `Este mazo tiene ${maxFamilies} familias; baja las cartas por paquete.`;
    }

    return null;
}

/** Deterministic 5-99 variation around a family profile - invented creatures get distinct
 *  but stable stats without anyone hand-typing hundreds of numbers. */
function derivedStat(base: number, seed: string): number {
    const spread = (hashString(seed) % 25) - 12;
    return Math.max(5, Math.min(99, base + spread));
}

function familyEntities(deck: DeckDefinition, family: DeckFamily): DeckEntity[] {
    return family.members.map((member, index) => {
        const stats: Record<string, number> = {};
        for (const attribute of deck.attributes) {
            const real = member.stats?.[attribute.key];
            stats[attribute.key] =
                real ??
                derivedStat(
                    family.profile?.[attribute.key] ?? 50,
                    `${deck.id}:${family.key}:${index}:${attribute.key}`,
                );
        }

        const ink = member.ink ?? family.ink;
        return {
            id: `${deck.id}:${family.key}:${index}`,
            familyKey: `${deck.id}:${family.key}`,
            name: member.name,
            imageUrl: renderCardArt({
                icon: member.icon ?? family.icon,
                palette: family.palette,
                ...(member.rank ? { rank: member.rank } : {}),
                ...(ink ? { ink } : {}),
            }),
            stats,
        };
    });
}

const entityCache = new Map<string, DeckEntity[][]>();

/** Every family of a bundled deck as resolved entities (art rendered once, memoized). */
export function deckFamilies(deck: DeckDefinition): DeckEntity[][] {
    const cached = entityCache.get(deck.id);
    if (cached) return cached;
    const families = deck.families.map((family) => familyEntities(deck, family));
    entityCache.set(deck.id, families);
    return families;
}

export { MOTORES_DECK, MYTHIC_DECK, NAIPES_DECK };
