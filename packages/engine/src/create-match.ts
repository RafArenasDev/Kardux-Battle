import type { MatchConfig, MatchState } from '@kardux/contracts';
import { createRngState } from './rng.js';

export interface CreateMatchOptions {
    matchId: string;
    code: string;
    /** Falls back to `config.seed` if given, then to `${matchId}:${code}` - always
     *  deterministic, never `Math.random()` (ADR 0003). */
    seed?: string;
    now: number;
}

/**
 * Fresh `LOBBY` state for a brand-new match. No players, no deck yet - those arrive via
 * `player.join` and `match.start`/`match.beginCountdown` actions.
 *
 * `TASK-01-backend.md` abbreviates this as `createMatch(config, seed)`; `now` is still an
 * explicit input (never `Date.now()` inside the engine, same rule as `reduce()`), so it's
 * bundled into one options object here instead of a longer positional parameter list.
 */
export function createMatch(config: MatchConfig, options: CreateMatchOptions): MatchState {
    const seed = options.seed ?? config.seed ?? `${options.matchId}:${options.code}`;

    return {
        matchId: options.matchId,
        code: options.code,
        config,
        phase: 'LOBBY',
        version: 0,
        seed,
        rng: createRngState(seed),
        createdAt: options.now,
        startedAt: null,
        endsAt: null,
        countdownEndsAt: null,
        turnDeadline: null,
        turnOpensAt: null,
        pendingDeck: null,
        players: [],
        piles: {},
        hostId: null,
        turnOrder: [],
        currentTurnIndex: 0,
        roundIndex: 0,
        round: null,
        pot: [],
        undealtCount: 0,
        winnerId: null,
        isDraw: false,
    };
}
