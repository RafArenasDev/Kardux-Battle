import type { DeckAttribute } from './types.js';
import type { IconName } from '../icons.generated.js';

/** Metadata for a deck whose cards are synced from a public API into the database once, at
 *  API start-up (`CardPoolEntry`), instead of being bundled with the app. */
export interface RemoteDeckMeta {
    id: 'pokeapi' | 'deckofcards';
    label: string;
    tagline: string;
    description: string;
    coverIcon: IconName;
    accent: string;
    attributes: readonly DeckAttribute[];
    /** Attribution shown in the lobby and the footer. */
    credits: string;
    /** Upper bounds the builder can always satisfy once the pool is synced. */
    maxPacks: number;
    maxCardsPerPack: number;
}

export const POKEMON_DECK: RemoteDeckMeta = {
    id: 'pokeapi',
    label: 'Pokémon',
    tagline: 'Estadísticas base oficiales',
    description:
        'Más de mil Pokémon con sus estadísticas base reales. Cada cuarteto comparte tipo elemental.',
    coverIcon: 'lightning-helix',
    accent: '#ffcb05',
    attributes: [
        { key: 'hp', label: 'PS', icon: 'heart-plus', higherIsBetter: true },
        { key: 'attack', label: 'Ataque', icon: 'muscle-up', higherIsBetter: true },
        { key: 'defense', label: 'Defensa', icon: 'checked-shield', higherIsBetter: true },
        { key: 'speed', label: 'Velocidad', icon: 'lightning-helix', higherIsBetter: true },
        { key: 'special-attack', label: 'At. especial', icon: 'magic-swirl', higherIsBetter: true },
        { key: 'special-defense', label: 'Def. especial', icon: 'brain', higherIsBetter: true },
    ],
    credits:
        'Datos vía PokéAPI (pokeapi.co). Proyecto de fans sin fines de lucro, no afiliado ni respaldado por Nintendo, Game Freak ni The Pokémon Company.',
    maxPacks: 6,
    maxCardsPerPack: 16,
};

/** Same attribute keys as the bundled `naipes` deck, which doubles as its offline fallback. */
export const POKER_DECK: RemoteDeckMeta = {
    id: 'deckofcards',
    label: 'Baraja de Póker',
    tagline: 'Las 52 cartas clásicas',
    description:
        'La baraja francesa de toda la vida: cada valor forma un cuarteto con sus cuatro palos.',
    coverIcon: 'spades',
    accent: '#e8e0cc',
    attributes: [
        { key: 'poder', label: 'Poder', icon: 'crown', higherIsBetter: true },
        { key: 'valor', label: 'Valor', icon: 'card-play', higherIsBetter: true },
        { key: 'palo', label: 'Palo', icon: 'spades', higherIsBetter: true },
    ],
    credits: 'Imágenes de cartas vía Deck of Cards API (deckofcardsapi.com).',
    maxPacks: 4,
    maxCardsPerPack: 13,
};

export const REMOTE_DECKS: readonly RemoteDeckMeta[] = [POKEMON_DECK, POKER_DECK];

/** Spanish names for PokéAPI's elemental types - one quartet family per type. */
export const POKEMON_TYPE_LABELS: Record<string, string> = {
    normal: 'Normal',
    fire: 'Fuego',
    water: 'Agua',
    grass: 'Planta',
    electric: 'Eléctrico',
    ice: 'Hielo',
    fighting: 'Lucha',
    poison: 'Veneno',
    ground: 'Tierra',
    flying: 'Volador',
    psychic: 'Psíquico',
    bug: 'Bicho',
    rock: 'Roca',
    ghost: 'Fantasma',
    dragon: 'Dragón',
    dark: 'Siniestro',
    steel: 'Acero',
    fairy: 'Hada',
};
