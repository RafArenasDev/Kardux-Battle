import { z } from 'zod';

/**
 * `GET /leaderboard` query params. Query strings always arrive as raw strings over HTTP, so
 * `limit` uses `z.coerce.number()` to turn `"20"` into `20` before the range check runs.
 * `cursor` is the opaque keyset token returned as `nextCursor` by a previous call - the API
 * is the only thing that ever encodes/decodes it, callers just pass it back verbatim.
 */
export const leaderboardQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

/**
 * One row of the global, persisted leaderboard (`LeaderboardStat` joined with `User`).
 * `avatarUrl` is resolved server-side from `User.avatarSeed` via `buildAvatarUrl` so clients
 * never need to know DiceBear is the provider behind it.
 */
export const leaderboardEntrySchema = z.object({
    userId: z.string().min(1),
    nickname: z.string().min(1),
    avatarUrl: z.string().url(),
    elo: z.number().int(),
    gamesPlayed: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    draws: z.number().int(),
    streak: z.number().int(),
    roundsWon: z.number().int(),
    cardsWonTotal: z.number().int(),
    favoriteAttribute: z.string().nullable(),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

/**
 * `GET /leaderboard` response. `nextCursor: null` means this was the last page. Only the
 * `global` scope exists: per-deck, per-period or friends rankings would need per-source stats,
 * time-bucketed stats and a friends graph, none of which the schema has.
 */
export const leaderboardResponseSchema = z.object({
    entries: z.array(leaderboardEntrySchema),
    nextCursor: z.string().nullable(),
});

export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
