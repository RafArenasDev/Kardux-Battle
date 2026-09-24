import type { EngineEvent } from './events.js';
import type { Card, MatchConfig, MatchState, Player, RoundResult } from '@kardux/contracts';
import { TABLE_TIMING } from '@kardux/contracts';

/** `null` when `turnTimeoutMs` is 0 (no limit configured for this match). `now` is when the
 *  turn opens: callers pass a later moment when the table is still animating. */
export function computeTurnDeadline(config: MatchConfig, now: number): number | null {
    return config.turnTimeoutMs > 0 ? now + config.turnTimeoutMs : null;
}

/** The next turn opens once the reveal of the round that just resolved has played out. */
export function afterReveal(now: number): number {
    return now + TABLE_TIMING.revealMs;
}

function standingsOf(players: readonly Player[]): Player[] {
    return [...players].sort(
        (a, b) =>
            Number(a.hasLeft) - Number(b.hasLeft) ||
            b.cardCount - a.cardCount ||
            // Among players with no cards, whoever lasted longer ranks higher.
            (b.eliminatedAt ?? Infinity) - (a.eliminatedAt ?? Infinity) ||
            a.seat - b.seat,
    );
}

/**
 * Called once every player in the current round has played (from `reduce.ts`'s
 * `round.playCard` handler). Compares the chosen attribute across every played card, then
 * either:
 *
 * - **clear winner**: they collect every card on the table plus any carried-over pot: cards
 *   move from `state.piles` (already emptied of the played card when it was played) into the
 *   winner's pile; any loser whose pile is now empty is eliminated (docs/SPEC.md rule 9); if
 *   that leaves a single active player, the match ends (rule 10, "un jugador tiene todas las
 *   cartas"); otherwise the winner leads the next round (rule 8).
 * - **tie** (2 or more players share the highest value, chained ties included): every played
 *   card joins the pot, nobody is eliminated (a tied value can never be the round's lowest),
 *   and the *same* leader starts the tie-breaking round (rule 7).
 *
 * Returns straight to `AWAITING_ATTRIBUTE` (or `FINISHED`) - `DEALING`/`REVEAL`/`RESOLVE`/
 * `TIE_POT` are reported via the returned events, not as a phase the state lingers in
 * (see README.md's "Match state machine" section for the rationale).
 */
export function resolveRound(
    state: MatchState,
    now: number,
): { state: MatchState; events: EngineEvent[] } {
    const round = state.round;

    if (!round) {
        throw new Error('resolveRound called with no active round.');
    }

    const attribute = round.attribute;
    const participantIds = round.playOrder;
    const cards = round.playedCards as Record<string, Card>;

    const values = participantIds.map((id) => ({ id, value: cards[id]!.stats[attribute]! }));
    const maxValue = Math.max(...values.map((entry) => entry.value));
    const winnerIds = values.filter((entry) => entry.value === maxValue).map((entry) => entry.id);
    const isTie = winnerIds.length !== 1;
    const allPlayedCards = participantIds.map((id) => cards[id]!);

    const revealedEvent: EngineEvent = { type: 'round.revealed', cards: { ...cards } };

    if (isTie) {
        const newPot = [...state.pot, ...allPlayedCards];
        const result: RoundResult = {
            index: round.index,
            attribute,
            cards: { ...cards },
            winnerId: null,
            isTie: true,
            potSize: 0,
            eliminatedPlayerIds: [],
        };

        const nextState: MatchState = {
            ...state,
            version: state.version + 1,
            phase: 'AWAITING_ATTRIBUTE',
            pot: newPot,
            round: null,
            turnOpensAt: afterReveal(now),
            turnDeadline: computeTurnDeadline(state.config, afterReveal(now)),
        };

        return {
            state: nextState,
            events: [
                revealedEvent,
                { type: 'round.resolved', result },
                { type: 'round.tie', potSize: newPot.length },
            ],
        };
    }

    const winnerId = winnerIds[0]!;
    const wonCards = [...allPlayedCards, ...state.pot];
    const newPiles = {
        ...state.piles,
        [winnerId]: [...(state.piles[winnerId] ?? []), ...wonCards],
    };

    const eliminatedPlayerIds = participantIds.filter(
        (id) => id !== winnerId && (newPiles[id]?.length ?? 0) === 0,
    );

    const newPlayers = state.players.map((player) => {
        if (!participantIds.includes(player.id) && player.id !== winnerId) {
            return player;
        }

        const cardCount = newPiles[player.id]?.length ?? player.cardCount;
        const isEliminated = eliminatedPlayerIds.includes(player.id);

        return {
            ...player,
            cardCount,
            isEliminated: isEliminated || player.isEliminated,
            isSpectator: isEliminated || player.isSpectator,
            eliminatedAt: isEliminated ? now : player.eliminatedAt,
        };
    });

    const newTurnOrder = state.turnOrder.filter((id) => !eliminatedPlayerIds.includes(id));

    const result: RoundResult = {
        index: round.index,
        attribute,
        cards: { ...cards },
        winnerId,
        isTie: false,
        potSize: wonCards.length,
        eliminatedPlayerIds,
    };

    const resolvedEvent: EngineEvent = { type: 'round.resolved', result };

    if (newTurnOrder.length <= 1) {
        const finalWinnerId = newTurnOrder[0] ?? winnerId;
        const finishedPlayers = newPlayers;

        const finishedState: MatchState = {
            ...state,
            version: state.version + 1,
            phase: 'FINISHED',
            piles: newPiles,
            players: finishedPlayers,
            turnOrder: newTurnOrder,
            round: null,
            pot: [],
            turnDeadline: null,
            endsAt: state.endsAt,
            winnerId: finalWinnerId,
            isDraw: false,
        };

        return {
            state: finishedState,
            events: [
                revealedEvent,
                resolvedEvent,
                {
                    type: 'match.finished',
                    standings: standingsOf(finishedPlayers),
                    winnerId: finalWinnerId,
                    isDraw: false,
                },
            ],
        };
    }

    const nextState: MatchState = {
        ...state,
        version: state.version + 1,
        phase: 'AWAITING_ATTRIBUTE',
        piles: newPiles,
        players: newPlayers,
        turnOrder: newTurnOrder,
        currentTurnIndex: newTurnOrder.indexOf(winnerId),
        round: null,
        pot: [],
        turnOpensAt: afterReveal(now),
        turnDeadline: computeTurnDeadline(state.config, afterReveal(now)),
    };

    return { state: nextState, events: [revealedEvent, resolvedEvent] };
}

/**
 * Forces the match to end because `matchDurationMs` elapsed (docs/SPEC.md rule 10): most cards
 * wins, a tied card count is a draw, based on each player's own pile (`Player.cardCount`).
 *
 * If the clock strikes mid-round (some players already played this round, or a tie's pot
 * hasn't been claimed yet), those specific cards are briefly "nobody's" - already out of the
 * players who played them, not yet awarded to a winner - and are excluded from every count
 * rather than guessed at. `apps/api`'s `MatchRuntimeService` is expected to schedule the
 * `matchDurationMs` timer well clear of `turnTimeoutMs` in practice, making this a rare edge
 * case rather than the common path.
 */
export function finishByTimeout(state: MatchState): { state: MatchState; events: EngineEvent[] } {
    const activePlayers = state.players.filter((player) => !player.isSpectator);
    const maxCards = Math.max(...activePlayers.map((player) => player.cardCount), 0);
    const leaders = activePlayers.filter((player) => player.cardCount === maxCards);
    const isDraw = leaders.length !== 1;
    const winnerId = isDraw ? null : leaders[0]!.id;

    const finishedState: MatchState = {
        ...state,
        version: state.version + 1,
        phase: 'FINISHED',
        round: null,
        turnDeadline: null,
        winnerId,
        isDraw,
    };

    return {
        state: finishedState,
        events: [
            {
                type: 'match.finished',
                standings: standingsOf(state.players),
                winnerId,
                isDraw,
            },
        ],
    };
}
