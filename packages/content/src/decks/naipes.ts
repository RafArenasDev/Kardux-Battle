import type { IconName } from '../icons.generated.js';
import type { DeckAttribute, DeckDefinition, DeckFamily } from './types.js';
import { text } from './types.js';

/**
 * The classic French deck played as a straight "high card wins" battle: there is one attribute
 * only, so nobody chooses. Ace (14) beats King (13) beats Queen (12) and so on down to 2. Suits
 * never break ties - equal ranks tie and the cards go to the pot like any other tie.
 */
export const CLASSIC_SUITS: readonly {
    key: string;
    label: { es: string; en: string };
    icon: IconName;
    rank: number;
    symbol: string;
    ink: string;
}[] = [
    {
        key: 'clubs',
        label: text('tréboles', 'clubs'),
        icon: 'clubs',
        rank: 1,
        symbol: '♣',
        ink: '#15131c',
    },
    {
        key: 'diamonds',
        label: text('diamantes', 'diamonds'),
        icon: 'diamonds',
        rank: 2,
        symbol: '♦',
        ink: '#b3122e',
    },
    {
        key: 'hearts',
        label: text('corazones', 'hearts'),
        icon: 'hearts',
        rank: 3,
        symbol: '♥',
        ink: '#b3122e',
    },
    {
        key: 'spades',
        label: text('picas', 'spades'),
        icon: 'spades',
        rank: 4,
        symbol: '♠',
        ink: '#15131c',
    },
];

export const CLASSIC_RANKS: readonly {
    rank: string;
    name: { es: string; en: string };
    value: number;
}[] = [
    { rank: 'A', name: text('As', 'Ace'), value: 14 },
    { rank: 'K', name: text('Rey', 'King'), value: 13 },
    { rank: 'Q', name: text('Reina', 'Queen'), value: 12 },
    { rank: 'J', name: text('Jota', 'Jack'), value: 11 },
    { rank: '10', name: text('Diez', 'Ten'), value: 10 },
    { rank: '9', name: text('Nueve', 'Nine'), value: 9 },
    { rank: '8', name: text('Ocho', 'Eight'), value: 8 },
    { rank: '7', name: text('Siete', 'Seven'), value: 7 },
    { rank: '6', name: text('Seis', 'Six'), value: 6 },
    { rank: '5', name: text('Cinco', 'Five'), value: 5 },
    { rank: '4', name: text('Cuatro', 'Four'), value: 4 },
    { rank: '3', name: text('Tres', 'Three'), value: 3 },
    { rank: '2', name: text('Dos', 'Two'), value: 2 },
];

/** "A", "10", "K" for a rank value - how the table shows the only attribute. */
export function classicValueLabel(value: number): string {
    return CLASSIC_RANKS.find((candidate) => candidate.value === value)?.rank ?? String(value);
}

export const CLASSIC_ATTRIBUTES: readonly DeckAttribute[] = [
    { key: 'valor', label: text('Valor', 'Rank'), icon: 'crown', higherIsBetter: true },
];

const families: DeckFamily[] = CLASSIC_RANKS.map(({ rank, name, value }) => ({
    key: `rank-${rank}`,
    label: name,
    icon: 'spades',
    palette: value >= 11 ? { from: '#fff6dc', to: '#e2c27a' } : { from: '#fffdf7', to: '#e6ddc8' },
    members: CLASSIC_SUITS.map((suit) => ({
        name: text(`${name.es} de ${suit.label.es}`, `${name.en} of ${suit.label.en}`),
        icon: suit.icon,
        rank,
        ink: suit.ink,
        stats: { valor: value },
    })),
}));

/** Bundled art for the classic deck - used when the Deck of Cards API images aren't synced. */
export const NAIPES_DECK: DeckDefinition = {
    id: 'naipes',
    label: text('Clásica', 'Classic'),
    tagline: text('Gana la carta más alta', 'Highest card wins'),
    description: text(
        'La baraja francesa: sin elegir atributo, el As vence al Rey, el Rey a la Reina… Valores iguales empatan.',
        'The French deck: no attribute to pick - Ace beats King, King beats Queen… Equal ranks tie.',
    ),
    coverIcon: 'spades',
    accent: '#e8e0cc',
    attributes: CLASSIC_ATTRIBUTES,
    families,
};
