import type { DeckSourceId, MatchConfig } from '@kardux/contracts';
import { renderCardArt } from '../art.js';
import { hashString } from '../avatars.js';
import { FAUNA_DECK } from './fauna.js';
import { MYTHIC_DECK } from './mythic.js';
import { NAIPES_DECK } from './naipes.js';
import type { DeckAttribute, DeckDefinition, DeckEntity, DeckFamily } from './types.js';

export type { DeckAttribute, DeckDefinition, DeckEntity, DeckFamily, DeckMember } from './types.js';

/** Every playable deck, in the order the lobby shows them. */
export const DECKS: readonly DeckDefinition[] = [MYTHIC_DECK, FAUNA_DECK, NAIPES_DECK];

/** `local` is the historical offline/dev deck id - it now plays the mythic deck so older
 *  configs (and the engine's own tests) keep working without any third-party data. */
export function getDeck(id: DeckSourceId): DeckDefinition | undefined {
    if (id === 'local') return MYTHIC_DECK;
    return DECKS.find((deck) => deck.id === id);
}

export interface DeckLimits {
    /** Max `packs`: the smallest family size (every quartet needs one card per pack). */
    maxPacks: number;
    /** Max `cardsPerPack`: the number of distinct families. */
    maxCardsPerPack: number;
    maxAttributes: number;
}

export function deckLimits(deck: DeckDefinition): DeckLimits {
    return {
        maxPacks: Math.min(...deck.families.map((family) => family.members.length)),
        maxCardsPerPack: deck.families.length,
        maxAttributes: deck.attributes.length,
    };
}

/** Attributes shared by every selected deck, in the first deck's priority order. */
export function sharedAttributes(decks: readonly DeckDefinition[]): DeckAttribute[] {
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
    const decks: DeckDefinition[] = [];
    for (const id of config.deckSources) {
        const deck = getDeck(id);
        if (!deck) return `El mazo "${id}" no está disponible.`;
        decks.push(deck);
    }

    const attributes = sharedAttributes(decks);
    if (attributes.length < config.attributeCount) {
        return `Este mazo solo ofrece ${attributes.length} atributos comparables; baja la cantidad de atributos.`;
    }

    const maxPacks = Math.min(...decks.map((deck) => deckLimits(deck).maxPacks));
    if (config.packs > maxPacks) {
        return `Este mazo admite como máximo ${maxPacks} paquetes.`;
    }

    const maxFamilies = decks.reduce((sum, deck) => sum + deckLimits(deck).maxCardsPerPack, 0);
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

        return {
            id: `${deck.id}:${family.key}:${index}`,
            familyKey: `${deck.id}:${family.key}`,
            name: member.name,
            imageUrl: renderCardArt({
                icon: member.icon ?? family.icon,
                palette: family.palette,
                ...(member.rank ? { rank: member.rank } : {}),
                ...(member.ink ?? family.ink ? { ink: member.ink ?? family.ink } : {}),
            }),
            stats,
        };
    });
}

const entityCache = new Map<string, DeckEntity[][]>();

/** Every family of a deck as resolved entities (art rendered once and memoized). */
export function deckFamilies(deck: DeckDefinition): DeckEntity[][] {
    const cached = entityCache.get(deck.id);
    if (cached) return cached;
    const families = deck.families.map((family) => familyEntities(deck, family));
    entityCache.set(deck.id, families);
    return families;
}

export { FAUNA_DECK, MYTHIC_DECK, NAIPES_DECK };
