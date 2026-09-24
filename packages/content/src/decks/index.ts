import type { DeckSourceId, MatchConfig } from '@kardux/contracts';
import { renderCardArt } from '../art.js';
import { hashString } from '../avatars.js';
import type { IconName } from '../icons.generated.js';
import { AUTOS_DECK } from './autos.js';
import { AVIONES_DECK } from './aviones.js';
import { MOTOS_DECK } from './motos.js';
import { MYTHIC_DECK } from './mythic.js';
import { NAIPES_DECK } from './naipes.js';
import type { RemoteDeckMeta } from './remote.js';
import { CLASSIC_DECK, POKEMON_DECK } from './remote.js';
import type {
    DeckAttribute,
    DeckDefinition,
    DeckEntity,
    DeckFamily,
    Locale,
    LocalizedText,
} from './types.js';
import { text } from './types.js';

export type {
    DeckAttribute,
    DeckDefinition,
    DeckEntity,
    DeckFamily,
    DeckMember,
    Locale,
    LocalizedText,
} from './types.js';
export { text } from './types.js';
export type { RemoteDeckMeta } from './remote.js';
export {
    CLASSIC_CARD_BACK_URL,
    CLASSIC_DECK_COUNT,
    CLASSIC_DECK,
    POKEMON_DECK,
    POKEMON_TYPE_LABELS,
    REMOTE_DECKS,
} from './remote.js';
export { CLASSIC_RANKS, CLASSIC_SUITS, classicValueLabel } from './naipes.js';

/** Decks bundled with the app (their own families and generated art). `naipes` is not listed
 *  in the catalog: it is the offline art for the classic deck. */
export const BUNDLED_DECKS: readonly DeckDefinition[] = [
    MYTHIC_DECK,
    AUTOS_DECK,
    MOTOS_DECK,
    AVIONES_DECK,
    NAIPES_DECK,
];

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
    label: LocalizedText;
    tagline: LocalizedText;
    description: LocalizedText;
    coverIcon: IconName;
    accent: string;
    attributes: readonly DeckAttribute[];
    credits?: LocalizedText;
    limits: DeckLimits;
    /** Single-attribute decks (the classic deck) compare automatically - nobody picks. */
    autoCompare: boolean;
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
        autoCompare: deck.attributes.length === 1,
    };
}

function remoteInfo(meta: RemoteDeckMeta): DeckInfo {
    return {
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
        autoCompare: meta.attributes.length === 1,
    };
}

/** Every battle deck, in lobby order. */
export const DECK_CATALOG: readonly DeckInfo[] = [
    remoteInfo(POKEMON_DECK),
    bundledInfo(MYTHIC_DECK),
    bundledInfo(AUTOS_DECK),
    bundledInfo(MOTOS_DECK),
    bundledInfo(AVIONES_DECK),
    remoteInfo(CLASSIC_DECK),
];

/** Metadata for any deck id, including the unlisted `naipes`/`local` ones. */
export function getDeckInfo(id: DeckSourceId): DeckInfo | undefined {
    const listed = DECK_CATALOG.find((deck) => deck.id === id);
    if (listed) return listed;
    const bundled = getDeck(id);
    return bundled ? bundledInfo(bundled) : undefined;
}

/** Bundled deck definition. `local` is the historical offline/dev id and plays the mythic
 *  deck, so older configs and the engine tests keep working. */
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

/** How many attributes a match really plays with: exactly one for a single-attribute deck. */
export function effectiveAttributeCount(
    deckSources: readonly DeckSourceId[],
    requested: number,
): number {
    const infos = deckSources
        .map((id) => getDeckInfo(id))
        .filter((info): info is DeckInfo => info !== undefined);
    const available = sharedAttributes(infos).length;
    return available === 1 ? 1 : Math.min(requested, available);
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
    if (attributes.length > 1 && attributes.length < config.attributeCount) {
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

/** Deterministic 5-99 variation around a family profile - invented creatures get distinct but
 *  stable stats. */
function derivedStat(base: number, seed: string): number {
    const spread = (hashString(seed) % 25) - 12;
    return Math.max(5, Math.min(99, base + spread));
}

function familyEntities(deck: DeckDefinition, family: DeckFamily): DeckEntity[] {
    return family.members.map((member, index) => {
        const stats: Record<string, number> = {};
        for (const attribute of deck.attributes) {
            const explicit = member.stats?.[attribute.key];
            stats[attribute.key] =
                explicit ??
                derivedStat(
                    family.profile?.[attribute.key] ?? 50,
                    `${deck.id}:${family.key}:${index}:${attribute.key}`,
                );
        }

        const ink = member.ink ?? family.ink;
        return {
            id: `${deck.id}:${family.key}:${index}`,
            familyKey: `${deck.id}:${family.key}`,
            name: member.name.es,
            nameEn: member.name.en,
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

/** Picks the text for a locale. */
export function localize(value: LocalizedText, locale: Locale): string {
    return value[locale];
}

export { AUTOS_DECK, AVIONES_DECK, MOTOS_DECK, MYTHIC_DECK, NAIPES_DECK };
