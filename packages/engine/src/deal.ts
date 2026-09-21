import type { Card, RngState } from '@kardux/contracts';
import { shuffle } from './rng.js';

export interface DealResult {
    piles: Record<string, Card[]>;
    rng: RngState;
}

/**
 * CLAUDE.md rule 4: shuffle the whole deck, discard whatever doesn't divide evenly
 * (`floor(total / players) * players`), then deal the rest round-robin. Shuffling before
 * truncating is what makes the discard "aleatorio" - which specific cards fall past the
 * cutoff depends entirely on the shuffle, never on their original position in the deck.
 *
 * `piles[playerId][0]` is that player's current in-play (top) card.
 */
export function dealDeck(
    deck: readonly Card[],
    playerIds: readonly string[],
    rng: RngState,
): DealResult {
    const [shuffled, nextRng] = shuffle(deck, rng);
    const playableCount = Math.floor(shuffled.length / playerIds.length) * playerIds.length;
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
