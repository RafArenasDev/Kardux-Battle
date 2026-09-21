import { matchConfigSchema } from '@kardux/contracts';
import type { Card, MatchConfig, MatchState, Player } from '@kardux/contracts';
import { createRngState } from './rng.js';

/**
 * Test-only helpers for constructing cards/players/states directly, without always routing
 * through `createMatch` -> `player.join` -> `match.start`. That full pipeline is exercised by
 * the end-to-end tests in `reduce.test.ts`; scenario tests that need an *exact* arrangement
 * (a guaranteed triple tie, a guaranteed non-divisible deck, a player one card away from
 * elimination) construct the state they need directly - the same way Redux reducer tests
 * commonly hand-build an intermediate state rather than replaying every action that could
 * theoretically produce it.
 */

export function card(code: string, quartet: string, stats: Record<string, number>): Card {
    return {
        code,
        quartet,
        name: `Card ${code}`,
        imageUrl: `https://example.com/${code}.png`,
        source: 'local',
        stats,
    };
}

export function player(id: string, overrides: Partial<Player> = {}): Player {
    return {
        id,
        nickname: id,
        avatarSeed: id,
        joinOrder: 0,
        seat: 0,
        isSpectator: false,
        isEliminated: false,
        eliminatedAt: null,
        cardCount: 0,
        ...overrides,
    };
}

export function config(overrides: Partial<MatchConfig> = {}): MatchConfig {
    return matchConfigSchema.parse(overrides);
}

/**
 * A minimal but fully valid `MatchState`. Every field can be overridden; `piles` and
 * `players[].cardCount` are kept in sync automatically unless `players` is overridden
 * explicitly (in which case the caller is asserting a deliberately inconsistent snapshot,
 * which should never happen from real `reduce()` output but is occasionally useful to
 * construct directly for a redaction test).
 */
export function state(overrides: Partial<MatchState> = {}): MatchState {
    const matchConfig = overrides.config ?? config();
    const piles = overrides.piles ?? {};
    const players =
        overrides.players ??
        Object.keys(piles).map((id, index) =>
            player(id, { joinOrder: index, seat: index, cardCount: piles[id]?.length ?? 0 }),
        );

    return {
        matchId: 'match-1',
        code: 'ABC123',
        config: matchConfig,
        phase: 'LOBBY',
        version: 0,
        seed: 'fixed-seed',
        rng: createRngState('fixed-seed'),
        createdAt: 0,
        startedAt: null,
        endsAt: null,
        countdownEndsAt: null,
        turnDeadline: null,
        pendingDeck: null,
        players,
        piles,
        hostId: players[0]?.id ?? null,
        turnOrder: players.filter((p) => !p.isSpectator).map((p) => p.id),
        currentTurnIndex: 0,
        roundIndex: 0,
        round: null,
        pot: [],
        winnerId: null,
        isDraw: false,
        ...overrides,
    };
}
