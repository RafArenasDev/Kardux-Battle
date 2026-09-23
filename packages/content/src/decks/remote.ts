import type { IconName } from '../icons.generated.js';
import { CLASSIC_ATTRIBUTES } from './naipes.js';
import type { DeckAttribute, LocalizedText } from './types.js';
import { text } from './types.js';

/** A deck whose cards are synced from a public API into the database (`card_pool_entries`)
 *  when the API boots, instead of being bundled with the app. */
export interface RemoteDeckMeta {
    id: 'pokeapi' | 'paises' | 'deckofcards';
    label: LocalizedText;
    tagline: LocalizedText;
    description: LocalizedText;
    coverIcon: IconName;
    accent: string;
    attributes: readonly DeckAttribute[];
    /** Attribution shown in the lobby and the footer. */
    credits: LocalizedText;
    /** Upper bounds the builder can always satisfy once the pool is synced. */
    maxPacks: number;
    maxCardsPerPack: number;
}

export const POKEMON_DECK: RemoteDeckMeta = {
    id: 'pokeapi',
    label: text('Pokémon', 'Pokémon'),
    tagline: text('Estadísticas base oficiales', 'Official base stats'),
    description: text(
        'Más de mil Pokémon con sus estadísticas base reales. Cada cuarteto comparte tipo elemental.',
        'Over a thousand Pokémon with their real base stats. Each quartet shares an elemental type.',
    ),
    coverIcon: 'lightning-helix',
    accent: '#ffcb05',
    attributes: [
        { key: 'hp', label: text('PS', 'HP'), icon: 'heart-plus', higherIsBetter: true },
        { key: 'attack', label: text('Ataque', 'Attack'), icon: 'muscle-up', higherIsBetter: true },
        {
            key: 'defense',
            label: text('Defensa', 'Defense'),
            icon: 'checked-shield',
            higherIsBetter: true,
        },
        {
            key: 'speed',
            label: text('Velocidad', 'Speed'),
            icon: 'lightning-helix',
            higherIsBetter: true,
        },
        {
            key: 'special-attack',
            label: text('At. especial', 'Sp. Attack'),
            icon: 'magic-swirl',
            higherIsBetter: true,
        },
        {
            key: 'special-defense',
            label: text('Def. especial', 'Sp. Defense'),
            icon: 'brain',
            higherIsBetter: true,
        },
    ],
    credits: text(
        'Datos vía PokéAPI (pokeapi.co). Pokémon es marca de sus dueños; proyecto de fans no afiliado.',
        'Data via PokéAPI (pokeapi.co). Pokémon is a trademark of its owners; unaffiliated fan project.',
    ),
    maxPacks: 6,
    maxCardsPerPack: 16,
};

export const COUNTRIES_DECK: RemoteDeckMeta = {
    id: 'paises',
    label: text('Países del mundo', 'World Countries'),
    tagline: text('Datos reales del Banco Mundial', 'Real World Bank data'),
    description: text(
        'Todos los países con su población, superficie, PIB, esperanza de vida y fronteras. Cada cuarteto es una región del mundo.',
        'Every country with its population, area, GDP, life expectancy and borders. Each quartet is a world region.',
    ),
    coverIcon: 'wireframe-globe',
    accent: '#3fd6a4',
    attributes: [
        {
            key: 'poblacion',
            label: text('Población', 'Population'),
            unit: 'hab.',
            icon: 'hooded-figure',
            higherIsBetter: true,
        },
        {
            key: 'area',
            label: text('Superficie', 'Area'),
            unit: 'km²',
            icon: 'measure-tape',
            higherIsBetter: true,
        },
        {
            key: 'pib',
            label: text('PIB', 'GDP'),
            unit: 'mil M US$',
            icon: 'crown',
            higherIsBetter: true,
        },
        {
            key: 'esperanza',
            label: text('Esperanza de vida', 'Life expectancy'),
            unit: 'años',
            icon: 'heart-plus',
            higherIsBetter: true,
        },
        {
            key: 'fronteras',
            label: text('Fronteras', 'Borders'),
            icon: 'linked-rings',
            higherIsBetter: true,
        },
    ],
    credits: text(
        'Datos: Banco Mundial (CC BY 4.0) y mledoze/countries (ODbL). Banderas: flagcdn.com.',
        'Data: World Bank (CC BY 4.0) and mledoze/countries (ODbL). Flags: flagcdn.com.',
    ),
    maxPacks: 4,
    maxCardsPerPack: 16,
};

/** Same single attribute as the bundled `naipes` deck, which doubles as its offline fallback. */
export const CLASSIC_DECK: RemoteDeckMeta = {
    id: 'deckofcards',
    label: text('Clásica', 'Classic'),
    tagline: text('Gana la carta más alta', 'Highest card wins'),
    description: text(
        'Hasta 6 barajas francesas: sin elegir atributo, el As vence al Rey, el Rey a la Reina… Valores iguales empatan y van al pozo.',
        'Up to 6 French decks: no attribute to pick - Ace beats King, King beats Queen… Equal ranks tie and go to the pot.',
    ),
    coverIcon: 'spades',
    accent: '#e8e0cc',
    attributes: CLASSIC_ATTRIBUTES,
    credits: text(
        'Imágenes de cartas vía Deck of Cards API (deckofcardsapi.com).',
        'Card images via Deck of Cards API (deckofcardsapi.com).',
    ),
    // 6 decks are synced: every rank has 24 copies (4 suits x 6 decks).
    maxPacks: 24,
    maxCardsPerPack: 13,
};

/** How many 52-card decks the classic pool keeps (Deck of Cards API `deck_count`). */
export const CLASSIC_DECK_COUNT = 6;

export const REMOTE_DECKS: readonly RemoteDeckMeta[] = [POKEMON_DECK, COUNTRIES_DECK, CLASSIC_DECK];

/** Card back served by the Deck of Cards API - used for the classic deck and casino tables. */
export const CLASSIC_CARD_BACK_URL = 'https://deckofcardsapi.com/static/img/back.png';

/** Pokémon elemental types - one quartet family per type. */
export const POKEMON_TYPE_LABELS: Record<string, LocalizedText> = {
    normal: text('Normal', 'Normal'),
    fire: text('Fuego', 'Fire'),
    water: text('Agua', 'Water'),
    grass: text('Planta', 'Grass'),
    electric: text('Eléctrico', 'Electric'),
    ice: text('Hielo', 'Ice'),
    fighting: text('Lucha', 'Fighting'),
    poison: text('Veneno', 'Poison'),
    ground: text('Tierra', 'Ground'),
    flying: text('Volador', 'Flying'),
    psychic: text('Psíquico', 'Psychic'),
    bug: text('Bicho', 'Bug'),
    rock: text('Roca', 'Rock'),
    ghost: text('Fantasma', 'Ghost'),
    dragon: text('Dragón', 'Dragon'),
    dark: text('Siniestro', 'Dark'),
    steel: text('Acero', 'Steel'),
    fairy: text('Hada', 'Fairy'),
};
