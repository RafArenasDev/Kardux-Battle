import type { MatchState, PublicRoundView, RedactedMatchState } from '@kardux/contracts';

/**
 * The only supported way to turn the authoritative `MatchState` into something safe to send
 * to a specific player. This is where CLAUDE.md's non-negotiable ("el cliente nunca ... conoce
 * cartas ajenas") is actually enforced - `viewerId`'s own top card is the only card that ever
 * leaves this function; a round's played cards only appear once they're `revealedAt` or later.
 */
export function redactFor(viewerId: string, state: MatchState): RedactedMatchState {
    const yourPile = state.piles[viewerId];

    return {
        matchId: state.matchId,
        code: state.code,
        config: state.config,
        phase: state.phase,
        version: state.version,
        startedAt: state.startedAt,
        endsAt: state.endsAt,
        countdownEndsAt: state.countdownEndsAt,
        turnDeadline: state.turnDeadline,
        players: state.players,
        hostId: state.hostId,
        turnOrder: state.turnOrder,
        currentTurnIndex: state.currentTurnIndex,
        yourId: viewerId,
        yourTopCard: yourPile && yourPile.length > 0 ? yourPile[0]! : null,
        round: state.round ? redactRound(state.round) : null,
        potSize: state.pot.length,
        winnerId: state.winnerId,
        isDraw: state.isDraw,
    };
}

/**
 * A round only ever exists in *persisted* state while it's still being played (some players
 * haven't submitted their card yet) - the moment the last card comes in, `reduce()` resolves
 * the round and moves on to the next one (or finishes the match) within that same call (see
 * `round.ts`). So a state snapshot's current round never has anything to reveal yet:
 * `revealedCards` is always empty here. The actual reveal is a one-off event
 * (`round.revealed` in `EngineEvent`), not something a later snapshot needs to reconstruct.
 */
function redactRound(round: NonNullable<MatchState['round']>): PublicRoundView {
    return {
        index: round.index,
        leaderId: round.leaderId,
        attribute: round.attribute,
        playOrder: round.playOrder,
        playedBy: Object.keys(round.playedCards),
        revealedCards: {},
    };
}
