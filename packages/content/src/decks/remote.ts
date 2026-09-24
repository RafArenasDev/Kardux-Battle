import type { IconName } from '../icons.generated.js';
import type { DeckAttribute, LocalizedText } from './types.js';
import { text } from './types.js';

/** A deck whose cards are synced from a public API into the database (`card_pool_entries`)
 *  when the API boots, instead of being bundled with the app. */
export interface RemoteDeckMeta {
    id: 'pokeapi';
    label: LocalizedText;
    tagline: LocalizedText;
    description: LocalizedText;
    coverIcon: IconName;
    accent: string;
    attributes: readonly DeckAttribute[];
    /** Attribution for the data source. */
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
        'Datos e imágenes vía PokéAPI (pokeapi.co).',
        'Data and images via PokéAPI (pokeapi.co).',
    ),
    maxPacks: 6,
    maxCardsPerPack: 16,
};

export const REMOTE_DECKS: readonly RemoteDeckMeta[] = [POKEMON_DECK];

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
