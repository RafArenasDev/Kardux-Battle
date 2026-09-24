/** Starting rating of every account, and the classic chess K-factor. */
export const BASE_RATING = 1200;
export const RATING_K = 32;

export interface RatedPlayer {
    id: string;
    rating: number;
    /** Final position, 1 = best. Players sharing a position drew against each other. */
    placement: number;
}

/**
 * Multiplayer Elo: a match of N players is scored as every pair playing each other once.
 * Against each rival a player scores 1 (finished above), 0.5 (same place) or 0 (below), and the
 * expected score comes from the rating gap (`1 / (1 + 10^((Rb - Ra) / 400))`). The summed
 * difference is scaled by `K / (N - 1)`, so a 7-player table moves ratings about as much as a
 * duel: beating stronger rivals is worth more, losing to weaker ones costs more.
 *
 * Pure and deterministic; returns the rating change per player id (rounded, never NaN).
 */
export function ratingChanges(players: readonly RatedPlayer[], k = RATING_K): Map<string, number> {
    const changes = new Map<string, number>();
    const rivals = players.length - 1;

    for (const player of players) {
        if (rivals === 0) {
            changes.set(player.id, 0);
            continue;
        }

        let delta = 0;
        for (const other of players) {
            if (other.id === player.id) continue;
            const actual =
                player.placement < other.placement
                    ? 1
                    : player.placement === other.placement
                      ? 0.5
                      : 0;
            const expected = 1 / (1 + 10 ** ((other.rating - player.rating) / 400));
            delta += actual - expected;
        }
        changes.set(player.id, Math.round((k / rivals) * delta));
    }

    return changes;
}

/**
 * Final positions from a match's standings: most cards first, equal counts share a position,
 * and anyone who left the match is placed after everyone who stayed (they finish with zero
 * cards, but a player who was knocked out fairly still ranks above a quitter).
 */
export function placementsOf(
    standings: readonly { id: string; cardCount: number; hasLeft: boolean }[],
): Map<string, number> {
    const ordered = [...standings].sort(
        (a, b) => Number(a.hasLeft) - Number(b.hasLeft) || b.cardCount - a.cardCount,
    );
    const placements = new Map<string, number>();
    ordered.forEach((player, index) => {
        const previous = ordered[index - 1];
        const shared =
            previous !== undefined &&
            previous.hasLeft === player.hasLeft &&
            previous.cardCount === player.cardCount;
        placements.set(player.id, shared ? placements.get(previous.id)! : index + 1);
    });
    return placements;
}
