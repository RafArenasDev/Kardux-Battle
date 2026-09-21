import { z } from 'zod';
import { cardSchema } from './card.js';
import { matchConfigSchema } from './match-config.js';
import { playerSchema } from './player.js';

/**
 * `LOBBY -> COUNTDOWN -> DEALING -> AWAITING_ATTRIBUTE -> AWAITING_CARDS -> REVEAL -> RESOLVE
 * -> (AWAITING_ATTRIBUTE | TIE_POT | FINISHED)`, exactly as CLAUDE.md's "MÁQUINA DE ESTADOS"
 * section specifies. `TIE_POT` loops back into a fresh `AWAITING_ATTRIBUTE` for the
 * tie-breaking round (same leader, new round index) once the pot carry-over is applied.
 */
export const MATCH_PHASES = [
    'LOBBY',
    'COUNTDOWN',
    'DEALING',
    'AWAITING_ATTRIBUTE',
    'AWAITING_CARDS',
    'REVEAL',
    'RESOLVE',
    'TIE_POT',
    'FINISHED',
] as const;

export type MatchPhase = (typeof MATCH_PHASES)[number];

/** Internal state of the sfc32 seeded RNG (see `@kardux/engine`'s `rng.ts`). Persisted as
 *  part of `MatchState`, not re-derived, so `reduce()` stays a pure function of
 *  `(state, action, ctx)` - the *next* random draw depends only on this tuple, never on
 *  wall-clock time or a module-level generator instance. */
export const rngStateSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type RngState = z.infer<typeof rngStateSchema>;

export const roundStateSchema = z.object({
    index: z.number().int().min(0),
    leaderId: z.string().min(1),
    attribute: z.string().min(1),
    /** Turn-rotation order for this round only: leader first, then the rest of `turnOrder`
     *  starting right after the leader. */
    playOrder: z.array(z.string().min(1)),
    /** Keyed by player id; only has entries for players who already played this round. */
    playedCards: z.record(z.string(), cardSchema),
});

export type RoundState = z.infer<typeof roundStateSchema>;

/**
 * The full, authoritative state of a match. Lives only on the server
 * (`MatchRuntimeService`, see ADR 0002) and is what gets persisted as `DeckSnapshot`/
 * `MatchEvent` JSONB - never sent to a client as-is. `redactFor(playerId, state)` (in
 * `@kardux/engine`) is the only supported way to turn this into something safe to
 * broadcast; see `RedactedMatchState` below for that shape.
 */
export const matchStateSchema = z.object({
    matchId: z.string().min(1),
    code: z.string().length(6),
    config: matchConfigSchema,
    phase: z.enum(MATCH_PHASES),
    /** Monotonically increasing on every `reduce()` call that actually changes state - lets a
     *  client detect it missed a broadcast and needs a fresh `match:state` snapshot instead of
     *  trusting a stale one. */
    version: z.number().int().min(0),
    seed: z.string().min(1),
    rng: rngStateSchema,
    createdAt: z.number().int(),
    startedAt: z.number().int().nullable(),
    /** `startedAt + config.matchDurationMs`, or `null` when `matchDurationMs` is 0. */
    endsAt: z.number().int().nullable(),
    countdownEndsAt: z.number().int().nullable(),
    /** Stashed between `match.beginCountdown` and the countdown actually elapsing, so the
     *  engine never needs to fetch or rebuild a deck itself (ADR 0003: no I/O). */
    pendingDeck: z.array(cardSchema).nullable(),
    players: z.array(playerSchema),
    /** Face-down pile per player id; `piles[id][0]` is that player's current in-play card.
     *  Kept out of `Player` on purpose - `Player` is what's safe to show everyone, this is
     *  the part that `redactFor` must never leak for anyone but its owner. */
    piles: z.record(z.string(), z.array(cardSchema)),
    hostId: z.string().min(1).nullable(),
    /** Active (non-eliminated, non-spectator) player ids, in rotation order. */
    turnOrder: z.array(z.string().min(1)),
    currentTurnIndex: z.number().int().min(0),
    round: roundStateSchema.nullable(),
    /** Cards carried over from tied rounds, waiting for the next clear winner. */
    pot: z.array(cardSchema),
    winnerId: z.string().min(1).nullable(),
    isDraw: z.boolean(),
});

export type MatchState = z.infer<typeof matchStateSchema>;

/** What a viewer sees of the current round: everyone can see who has already played and
 *  the chosen attribute, but the actual cards stay hidden until the engine reaches
 *  `REVEAL` (or later) - matching the "todas a la vez" flip in CLAUDE.md's animation table,
 *  not the progressive reveal the original brief described. */
export const publicRoundViewSchema = z.object({
    index: z.number().int().min(0),
    leaderId: z.string().min(1),
    attribute: z.string().min(1),
    playOrder: z.array(z.string().min(1)),
    playedBy: z.array(z.string().min(1)),
    revealedCards: z.record(z.string(), cardSchema),
});

export type PublicRoundView = z.infer<typeof publicRoundViewSchema>;

/**
 * What `match:state` actually sends: the same for every field that's already public
 * (config, players, turn order, ...), but `yourTopCard` only ever contains the recipient's
 * own card - this, not `Player`, is where "the client never sees another player's card"
 * (CLAUDE.md's non-negotiable) is enforced.
 */
export const redactedMatchStateSchema = z.object({
    matchId: z.string().min(1),
    code: z.string().length(6),
    config: matchConfigSchema,
    phase: z.enum(MATCH_PHASES),
    version: z.number().int().min(0),
    startedAt: z.number().int().nullable(),
    endsAt: z.number().int().nullable(),
    countdownEndsAt: z.number().int().nullable(),
    players: z.array(playerSchema),
    hostId: z.string().min(1).nullable(),
    turnOrder: z.array(z.string().min(1)),
    currentTurnIndex: z.number().int().min(0),
    yourId: z.string().min(1),
    yourTopCard: cardSchema.nullable(),
    round: publicRoundViewSchema.nullable(),
    potSize: z.number().int().min(0),
    winnerId: z.string().min(1).nullable(),
    isDraw: z.boolean(),
});

export type RedactedMatchState = z.infer<typeof redactedMatchStateSchema>;

/** Payload for `round:resolved` - a full account of what just happened, used both for the
 *  live broadcast and as the row shape persisted into `Round.playedCards` (JSONB). */
export const roundResultSchema = z.object({
    index: z.number().int().min(0),
    attribute: z.string().min(1),
    cards: z.record(z.string(), cardSchema),
    winnerId: z.string().min(1).nullable(),
    isTie: z.boolean(),
    /** Cards the winner collects (this round's cards + any carried-over pot); 0 on a tie. */
    potSize: z.number().int().min(0),
    eliminatedPlayerIds: z.array(z.string().min(1)),
});

export type RoundResult = z.infer<typeof roundResultSchema>;
