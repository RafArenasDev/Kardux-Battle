import type { IconName } from '../icons.generated.js';
import type { DeckDefinition, DeckFamily } from './types.js';

/** The classic 52-card French deck (public domain). Each rank is a quartet family, each suit a
 *  pack, so a default 4x8 match plays with four suits of eight ranks. `poder` is unique per
 *  card (value x 4 + suit), so that attribute can never tie. */
const SUITS: readonly { key: string; label: string; icon: IconName; rank: number; ink: string }[] = [
    { key: 'treboles', label: 'tréboles', icon: 'clubs', rank: 1, ink: '#15131c' },
    { key: 'diamantes', label: 'diamantes', icon: 'diamonds', rank: 2, ink: '#b3122e' },
    { key: 'corazones', label: 'corazones', icon: 'hearts', rank: 3, ink: '#b3122e' },
    { key: 'picas', label: 'picas', icon: 'spades', rank: 4, ink: '#15131c' },
];

const RANKS: readonly { rank: string; name: string; value: number }[] = [
    { rank: 'A', name: 'As', value: 14 },
    { rank: 'K', name: 'Rey', value: 13 },
    { rank: 'Q', name: 'Reina', value: 12 },
    { rank: 'J', name: 'Jota', value: 11 },
    { rank: '10', name: 'Diez', value: 10 },
    { rank: '9', name: 'Nueve', value: 9 },
    { rank: '8', name: 'Ocho', value: 8 },
    { rank: '7', name: 'Siete', value: 7 },
    { rank: '6', name: 'Seis', value: 6 },
    { rank: '5', name: 'Cinco', value: 5 },
    { rank: '4', name: 'Cuatro', value: 4 },
    { rank: '3', name: 'Tres', value: 3 },
    { rank: '2', name: 'Dos', value: 2 },
];

const families: DeckFamily[] = RANKS.map(({ rank, name, value }) => ({
    key: `rango-${rank}`,
    label: name,
    icon: 'spades',
    palette: value >= 11 ? { from: '#fff6dc', to: '#e2c27a' } : { from: '#fffdf7', to: '#e6ddc8' },
    members: SUITS.map((suit) => ({
        name: `${name} de ${suit.label}`,
        icon: suit.icon,
        rank,
        ink: suit.ink,
        stats: { poder: value * 4 + suit.rank, valor: value, palo: suit.rank },
    })),
}));

export const NAIPES_DECK: DeckDefinition = {
    id: 'naipes',
    label: 'Baraja Clásica',
    tagline: 'Los naipes de toda la vida',
    description:
        'La baraja francesa de 52 cartas. Cada valor forma un cuarteto con sus cuatro palos.',
    coverIcon: 'spades',
    accent: '#e8e0cc',
    attributes: [
        { key: 'poder', label: 'Poder', icon: 'crown', higherIsBetter: true },
        { key: 'valor', label: 'Valor', icon: 'card-play', higherIsBetter: true },
        { key: 'palo', label: 'Palo', icon: 'spades', higherIsBetter: true },
    ],
    families,
};
