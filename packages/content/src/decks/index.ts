import type { DeckSourceId, MatchConfig } from '@kardux/contracts';
import type { IconName } from '../icons.generated.js';
import type { RemoteDeckMeta } from './remote.js';
import { POKEMON_DECK } from './remote.js';
import type { DeckAttribute, Locale, LocalizedText } from './types.js';
import { text } from './types.js';

export type { DeckAttribute, DeckEntity, Locale, LocalizedText } from './types.js';
export { text } from './types.js';
export type { RemoteDeckMeta } from './remote.js';
export { POKEMON_DECK, POKEMON_TYPE_LABELS, REMOTE_DECKS } from './remote.js';

export interface DeckLimits {
    /** Max `packs`: every quartet needs one card per pack. */
    maxPacks: number;
    /** Max `cardsPerPack`: the number of distinct families. */
    maxCardsPerPack: number;
    maxAttributes: number;
}

/** What the lobby needs to know about a playable deck. */
export interface DeckInfo {
    id: DeckSourceId;
    label: LocalizedText;
    tagline: LocalizedText;
    description: LocalizedText;
    coverIcon: IconName;
    accent: string;
    attributes: readonly DeckAttribute[];
    credits: LocalizedText;
    limits: DeckLimits;
}

function deckInfo(meta: RemoteDeckMeta): DeckInfo {
    return {
        id: meta.id,
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
    };
}

/** Every playable deck, in lobby order. */
export const DECK_CATALOG: readonly DeckInfo[] = [deckInfo(POKEMON_DECK)];

export function getDeckInfo(id: DeckSourceId): DeckInfo | undefined {
    return DECK_CATALOG.find((deck) => deck.id === id);
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

/** Why a config can't be built (in both languages), or `null` when it can. Shared by the API
 *  (rejects the request) and the web form (disables "Create"). */
export function validateDeckConfig(config: DeckConfig): LocalizedText | null {
    const decks: DeckInfo[] = [];
    for (const id of config.deckSources) {
        const deck = getDeckInfo(id);
        if (!deck) {
            return text(`El mazo "${id}" no está disponible.`, `Deck "${id}" is not available.`);
        }
        decks.push(deck);
    }

    const attributes = sharedAttributes(decks);
    if (attributes.length < config.attributeCount) {
        return text(
            `Este mazo solo ofrece ${attributes.length} atributos; baja la cantidad de atributos.`,
            `This deck only has ${attributes.length} attributes; lower the attribute count.`,
        );
    }

    const maxPacks = Math.min(...decks.map((deck) => deck.limits.maxPacks));
    if (config.packs > maxPacks) {
        return text(
            `Este mazo admite como máximo ${maxPacks} paquetes.`,
            `This deck allows at most ${maxPacks} packs.`,
        );
    }

    const maxFamilies = decks.reduce((sum, deck) => sum + deck.limits.maxCardsPerPack, 0);
    if (config.cardsPerPack > maxFamilies) {
        return text(
            `Este mazo tiene ${maxFamilies} familias; baja las cartas por paquete.`,
            `This deck has ${maxFamilies} families; lower the cards per pack.`,
        );
    }

    const total = config.packs * config.cardsPerPack;
    if (total < config.maxPlayers) {
        return text(
            `El mazo (${total} cartas) es muy pequeño para ${config.maxPlayers} jugadores.`,
            `The deck (${total} cards) is too small for ${config.maxPlayers} players.`,
        );
    }

    return null;
}

/** Picks the text for a locale. */
export function localize(value: LocalizedText, locale: Locale): string {
    return value[locale];
}
