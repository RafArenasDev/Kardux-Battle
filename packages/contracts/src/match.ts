import { z } from 'zod';
import { matchConfigPatchSchema, matchConfigSchema } from './match-config.js';

/**
 * Coarse, DB-level lifecycle (`Match.status` in Prisma) - distinct from the engine's
 * fine-grained `MatchPhase` (`LOBBY -> COUNTDOWN -> DEALING -> ...` in `match-state.ts`),
 * which only exists once `MatchRuntimeService` has a live match loaded. A row can sit in
 * `LOBBY` for a long time before any engine state exists for it at all.
 */
export const MATCH_RECORD_STATUSES = ['LOBBY', 'IN_PROGRESS', 'FINISHED'] as const;
export type MatchRecordStatus = (typeof MATCH_RECORD_STATUSES)[number];
export const matchRecordStatusSchema = z.enum(MATCH_RECORD_STATUSES);

/** `POST /matches` body: every `MatchConfig` field is optional here and filled with
 *  `matchConfigSchema`'s defaults server-side (CLAUDE.md: "todo configurable desde el
 *  lobby", but nothing is required to create the room). */
export const createMatchRequestSchema = matchConfigPatchSchema;
export type CreateMatchRequest = z.infer<typeof createMatchRequestSchema>;

/** What `POST /matches`, `GET /matches/:code`, and each item of `GET /matches/public`
 *  return - a snapshot of the `Match` row, not the live engine state (see `MatchRecordStatus`
 *  above). `hostNickname`/`hostAvatarUrl` are joined in from `User` so a lobby screen can
 *  render the host without a second request. */
export const matchSummarySchema = z.object({
    matchId: z.string().min(1),
    code: z.string().length(6),
    status: matchRecordStatusSchema,
    config: matchConfigSchema,
    hostId: z.string().min(1),
    hostNickname: z.string().min(1),
    hostAvatarUrl: z.string().url(),
    /** Approved players currently seated (the host included once they joined). */
    playerCount: z.number().int().min(0),
    createdAt: z.string().datetime(),
});
export type MatchSummary = z.infer<typeof matchSummarySchema>;

export const matchSummaryListSchema = z.array(matchSummarySchema);

/** The caller's relationship to a match returned by `GET /matches/mine`: `admin` for the
 *  host, `player` for an approved `MatchPlayer` (CLAUDE.md's `status` split, see
 *  `MatchPlayerStatus` in the Prisma schema - only `APPROVED` rows count as "mine"; a still
 *  `PENDING` join request doesn't make the match show up here yet). */
export const MATCH_PLAYER_ROLES = ['admin', 'player'] as const;
export type MatchPlayerRole = (typeof MATCH_PLAYER_ROLES)[number];
export const matchPlayerRoleSchema = z.enum(MATCH_PLAYER_ROLES);

/** `GET /matches/mine`'s per-item shape: the same `MatchSummary` plus the caller's role in
 *  that specific match. A host who is *also* an approved player in their own match still
 *  only gets `"admin"` - host status takes precedence, since the host is who `match:respondJoin`
 *  authorizes regardless of whether they seated themselves as a player too. */
export const matchSummaryWithRoleSchema = matchSummarySchema.extend({
    role: matchPlayerRoleSchema,
});
export type MatchSummaryWithRole = z.infer<typeof matchSummaryWithRoleSchema>;

export const matchSummaryWithRoleListSchema = z.array(matchSummaryWithRoleSchema);
