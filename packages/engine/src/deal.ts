import type { Card, RngState } from '@kardux/contracts';
import { shuffle } from './rng.js';

export interface DealResult {
    piles: Record<string, Card[]>;
    rng: RngState;
}

/**
 * docs/SPEC.md rule 4: shuffle the whole deck, keep out whatever doesn't divide evenly
 * (`floor(total / players) * players`) - or, when the match sets `cardsPerPlayer`, everything
 * beyond that many cards each - then deal round-robin. The rest stays in the deck, out of play. Shuffling before
 * truncating is what makes the discard "aleatorio" - which specific cards fall past the
 * cutoff depends entirely on the shuffle, never on their original position in the deck.
 *
 * `piles[playerId][0]` is that player's current in-play (top) card.
 */
export function dealDeck(
    deck: readonly Card[],
    playerIds: readonly string[],
    rng: RngState,
    /** Cards per player; `0` deals every card that divides evenly (the original rule). */
    cardsPerPlayer = 0,
): DealResult {
    const [shuffled, nextRng] = shuffle(deck, rng);
    const evenShare = Math.floor(shuffled.length / playerIds.length);
    const share = cardsPerPlayer > 0 ? Math.min(cardsPerPlayer, evenShare) : evenShare;
    const playableCount = share * playerIds.length;
    const usable = shuffled.slice(0, playableCount);

    const piles: Record<string, Card[]> = {};

    for (const playerId of playerIds) {
        piles[playerId] = [];
    }

    usable.forEach((card, index) => {
        const playerId = playerIds[index % playerIds.length]!;
        piles[playerId]!.push(card);
    });

    return { piles, rng: nextRng };
}
