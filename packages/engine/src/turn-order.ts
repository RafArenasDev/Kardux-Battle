import type { Card } from '@kardux/contracts';

/**
 * docs/SPEC.md rule 5: whoever holds `1A` goes first; if it wasn't dealt to anyone (it fell in
 * the discarded remainder), search `1A, 1B … 1M, 2A, 2B, …` in that exact order for the first
 * code that *was* dealt, and that card's owner starts. "In play" here means "was dealt to
 * some player at all," not "is currently on top of their pile" - the starting player still
 * plays whatever their top card happens to be once it's their turn, not `1A` itself.
 */
export function findFirstTurnPlayerId(
    piles: Readonly<Record<string, readonly Card[]>>,
    packs: number,
    cardsPerPack: number,
): string | null {
    for (let num = 1; num <= packs; num++) {
        for (let letterIndex = 0; letterIndex < cardsPerPack; letterIndex++) {
            const code = `${num}${String.fromCharCode(65 + letterIndex)}`;

            for (const [playerId, pile] of Object.entries(piles)) {
                if (pile.some((card) => card.code === code)) {
                    return playerId;
                }
            }
        }
    }

    return null;
}

/** Turn order after the first turn follows join order (docs/SPEC.md rule 5) - stable regardless
 *  of who happens to go first. */
export function buildTurnOrder(players: readonly { id: string; joinOrder: number }[]): string[] {
    return [...players].sort((a, b) => a.joinOrder - b.joinOrder).map((player) => player.id);
}

/** Rotates `turnOrder` so it starts at `leaderId` - this is a round's `playOrder`: the leader
 *  plays conceptually "first" (they chose the attribute), then everyone else in their usual
 *  rotation order. */
export function rotateToLeader(turnOrder: readonly string[], leaderId: string): string[] {
    const leaderIndex = turnOrder.indexOf(leaderId);

    if (leaderIndex === -1) {
        throw new Error(`rotateToLeader: "${leaderId}" is not in the current turn order.`);
    }

    return [...turnOrder.slice(leaderIndex), ...turnOrder.slice(0, leaderIndex)];
}
