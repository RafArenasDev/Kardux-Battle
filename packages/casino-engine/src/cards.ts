import type { RngState } from '@kardux/contracts';
import { shuffle } from '@kardux/engine';

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '0', 'J', 'Q', 'K', 'A'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

/** A playing card in Deck of Cards API notation: rank + suit, "0" is the ten ("0H", "AS"). */
export interface PlayingCard {
    code: string;
    rank: Rank;
    suit: Suit;
}

const IMAGE_BASE = 'https://deckofcardsapi.com/static/img';

/** Full card face served by the Deck of Cards API. */
export function cardImage(code: string): string {
    return `${IMAGE_BASE}/${code}.png`;
}

/** Card back served by the Deck of Cards API. */
export const CARD_BACK_IMAGE = `${IMAGE_BASE}/back.png`;

/** 2..14 (ace high). */
export function rankValue(rank: Rank): number {
    return RANKS.indexOf(rank) + 2;
}

export function makeCard(rank: Rank, suit: Suit): PlayingCard {
    return { code: `${rank}${suit}`, rank, suit };
}

/** `decks` full 52-card decks, shuffled with the table's seeded RNG. */
export function buildShoe(decks: number, rng: RngState): [PlayingCard[], RngState] {
    const cards: PlayingCard[] = [];
    for (let deck = 0; deck < decks; deck++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) cards.push(makeCard(rank, suit));
        }
    }
    return shuffle(cards, rng);
}

/** Takes `count` cards off the top of a shoe. */
export function draw(shoe: PlayingCard[], count = 1): [PlayingCard[], PlayingCard[]] {
    return [shoe.slice(0, count), shoe.slice(count)];
}
