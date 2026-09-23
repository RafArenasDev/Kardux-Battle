import { z } from 'zod';
import { cardSchema } from './card.js';
import type { errorPayloadSchema } from './errors.js';
import type { matchConfigPatchSchema } from './match-config.js';
import { matchConfigSchema } from './match-config.js';
import { playerSchema } from './player.js';
import type {
    publicRoundViewSchema,
    redactedMatchStateSchema,
    roundResultSchema,
} from './match-state.js';

/**
 * Namespace `/game` (CLAUDE.md's "CONTRATO DE EVENTOS SOCKET.IO"). Every payload below is a
 * Zod schema, validated on both ends: the gateway validates what it receives (never trusts a
 * client payload just because it type-checked on their side), and `ClientEvents`/
 * `ServerEvents` give `Socket<ClientEvents, ServerEvents>` (both in `apps/api`'s gateway and
 * in `apps/web`'s client) full autocomplete/type-checking for `socket.emit(...)` and
 * `socket.on(...)` without either side re-declaring the shapes.
 */

// ---- Client -> Server ----

export const matchCreatePayloadSchema = matchConfigSchema;
export type MatchCreatePayload = z.infer<typeof matchCreatePayloadSchema>;

export const matchCreateAckSchema = z.object({
    code: z.string().length(6),
    matchId: z.string().min(1),
    token: z.string().min(1),
    playerId: z.string().min(1),
});
export type MatchCreateAck = z.infer<typeof matchCreateAckSchema>;

export const matchJoinPayloadSchema = z.object({
    code: z.string().length(6),
    nickname: z.string().min(1).max(24),
    avatarSeed: z.string().min(1),
});
export type MatchJoinPayload = z.infer<typeof matchJoinPayloadSchema>;

export const matchJoinAckSchema = matchCreateAckSchema;
export type MatchJoinAck = z.infer<typeof matchJoinAckSchema>;

export const matchRejoinPayloadSchema = z.object({
    token: z.string().min(1),
});
export type MatchRejoinPayload = z.infer<typeof matchRejoinPayloadSchema>;

/**
 * `match:requestJoin` - the discovery counterpart to `match:join`: a player who picked the
 * match from `GET /matches/public` (no code in hand) instead of typing/receiving one. Creates
 * a `PENDING` `MatchPlayer` row that the host must approve via `match:respondJoin` before the
 * requester is actually seated - see the 2026-09-21 join-request design in CLAUDE.md.
 */
export const matchRequestJoinPayloadSchema = z.object({
    matchId: z.string().min(1),
    nickname: z.string().min(1).max(24),
    avatarSeed: z.string().min(1),
});
export type MatchRequestJoinPayload = z.infer<typeof matchRequestJoinPayloadSchema>;

/** `match:respondJoin` - host-only. `requestId` is the `PENDING` `MatchPlayer.id` created by
 *  `match:requestJoin`. */
export const matchRespondJoinPayloadSchema = z.object({
    requestId: z.string().min(1),
    accept: z.boolean(),
});
export type MatchRespondJoinPayload = z.infer<typeof matchRespondJoinPayloadSchema>;

export const roundSelectAttributePayloadSchema = z.object({
    attribute: z.string().min(1),
});
export type RoundSelectAttributePayload = z.infer<typeof roundSelectAttributePayloadSchema>;

export const chatSendPayloadSchema = z.object({
    text: z.string().min(1).max(500),
});
export type ChatSendPayload = z.infer<typeof chatSendPayloadSchema>;

export const pingLatencyPayloadSchema = z.object({
    t: z.number(),
});
export type PingLatencyPayload = z.infer<typeof pingLatencyPayloadSchema>;

// ---- Server -> Client ----

export const matchPlayerLeftPayloadSchema = z.object({
    playerId: z.string().min(1),
});
export type MatchPlayerLeftPayload = z.infer<typeof matchPlayerLeftPayloadSchema>;

export const matchCountdownPayloadSchema = z.object({
    endsAt: z.number().int(),
});
export type MatchCountdownPayload = z.infer<typeof matchCountdownPayloadSchema>;

export const roundAttributeSelectedPayloadSchema = z.object({
    attribute: z.string().min(1),
});
export type RoundAttributeSelectedPayload = z.infer<typeof roundAttributeSelectedPayloadSchema>;

export const roundCardPlayedPayloadSchema = z.object({
    playerId: z.string().min(1),
});
export type RoundCardPlayedPayload = z.infer<typeof roundCardPlayedPayloadSchema>;

export const roundRevealedPayloadSchema = z.object({
    cards: z.record(z.string(), cardSchema),
});
export type RoundRevealedPayload = z.infer<typeof roundRevealedPayloadSchema>;

export const roundTiePayloadSchema = z.object({
    potSize: z.number().int().min(0),
});
export type RoundTiePayload = z.infer<typeof roundTiePayloadSchema>;

export const turnTimerPayloadSchema = z.object({
    /** `null` when `turnTimeoutMs` is 0 (no limit) for this match. */
    deadline: z.number().int().nullable(),
});
export type TurnTimerPayload = z.infer<typeof turnTimerPayloadSchema>;

export const matchFinishedPayloadSchema = z.object({
    standings: z.array(playerSchema),
    winnerId: z.string().min(1).nullable(),
    isDraw: z.boolean(),
});
export type MatchFinishedPayload = z.infer<typeof matchFinishedPayloadSchema>;

export const chatMessagePayloadSchema = z.object({
    playerId: z.string().min(1),
    text: z.string().min(1).max(500),
    at: z.number().int(),
});
export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;

export const pongLatencyPayloadSchema = z.object({
    t: z.number(),
    serverTime: z.number(),
});
export type PongLatencyPayload = z.infer<typeof pongLatencyPayloadSchema>;

/** Sent to the host's socket(s) only, right after `match:requestJoin` creates the `PENDING`
 *  row - never broadcast to the room, since a still-pending request isn't public yet. */
export const matchJoinRequestedPayloadSchema = z.object({
    requestId: z.string().min(1),
    nickname: z.string().min(1).max(24),
    avatarSeed: z.string().min(1),
});
export type MatchJoinRequestedPayload = z.infer<typeof matchJoinRequestedPayloadSchema>;

/** Sent back to the requester's own socket right after `match:requestJoin`, so their UI can
 *  show a "waiting for host approval" state instead of assuming they're already seated. */
export const matchJoinRequestPendingPayloadSchema = z.object({
    requestId: z.string().min(1),
});
export type MatchJoinRequestPendingPayload = z.infer<typeof matchJoinRequestPendingPayloadSchema>;

/** Sent to the requester's socket when the host accepts via `match:respondJoin` - same shape
 *  as `match:join`'s ack (`code`/`matchId`/`token`/`playerId`) plus `requestId`, so a client
 *  that requested to join can transition into the match exactly like a direct joiner would. */
export const matchJoinApprovedPayloadSchema = matchJoinAckSchema.extend({
    requestId: z.string().min(1),
});
export type MatchJoinApprovedPayload = z.infer<typeof matchJoinApprovedPayloadSchema>;

/** Sent to the requester's socket when the host rejects via `match:respondJoin`. */
export const matchJoinRejectedPayloadSchema = z.object({
    requestId: z.string().min(1),
});
export type MatchJoinRejectedPayload = z.infer<typeof matchJoinRejectedPayloadSchema>;

/** Ack callbacks always resolve to either the expected payload or a typed error - never a
 *  thrown exception across the wire. */
export type AckResponse<T> = T | z.infer<typeof errorPayloadSchema>;

export interface ClientEvents {
    'match:create': (
        payload: MatchCreatePayload,
        ack: (response: AckResponse<MatchCreateAck>) => void,
    ) => void;
    'match:join': (
        payload: MatchJoinPayload,
        ack: (response: AckResponse<MatchJoinAck>) => void,
    ) => void;
    'match:rejoin': (
        payload: MatchRejoinPayload,
        ack: (response: AckResponse<MatchJoinAck>) => void,
    ) => void;
    /** No ack - the requester and the host each learn the outcome through their own
     *  server-pushed events (`match:joinRequestPending`/`error`, then eventually
     *  `match:joinApproved`/`match:joinRejected`), not a single synchronous response. */
    'match:requestJoin': (payload: MatchRequestJoinPayload) => void;
    /** No ack, host-only (enforced server-side; a non-host caller gets the generic `error`
     *  event with `ERR_NOT_HOST`). */
    'match:respondJoin': (payload: MatchRespondJoinPayload) => void;
    'match:config': (payload: z.infer<typeof matchConfigPatchSchema>) => void;
    'match:start': () => void;
    /** Host-only, `COUNTDOWN` phase only - cancels the `autoStartPlayers` countdown back to
     *  `LOBBY` (CLAUDE.md rule 3: "cancelable solo por el anfitrión"). No dedicated payload;
     *  the engine's `match.cancelCountdown` action needs nothing beyond the caller's id. */
    'match:cancelCountdown': () => void;
    'match:leave': () => void;
    'round:selectAttribute': (payload: RoundSelectAttributePayload) => void;
    'round:playCard': () => void;
    'chat:send': (payload: ChatSendPayload) => void;
    'ping:latency': (payload: PingLatencyPayload) => void;
}

export interface ServerEvents {
    'match:state': (payload: z.infer<typeof redactedMatchStateSchema>) => void;
    'match:playerJoined': (payload: z.infer<typeof playerSchema>) => void;
    'match:playerLeft': (payload: MatchPlayerLeftPayload) => void;
    'match:joinRequested': (payload: MatchJoinRequestedPayload) => void;
    'match:joinRequestPending': (payload: MatchJoinRequestPendingPayload) => void;
    'match:joinApproved': (payload: MatchJoinApprovedPayload) => void;
    'match:joinRejected': (payload: MatchJoinRejectedPayload) => void;
    'match:countdown': (payload: MatchCountdownPayload) => void;
    'match:started': () => void;
    'round:started': (payload: z.infer<typeof publicRoundViewSchema>) => void;
    'round:attributeSelected': (payload: RoundAttributeSelectedPayload) => void;
    'round:cardPlayed': (payload: RoundCardPlayedPayload) => void;
    'round:revealed': (payload: RoundRevealedPayload) => void;
    'round:resolved': (payload: z.infer<typeof roundResultSchema>) => void;
    'round:tie': (payload: RoundTiePayload) => void;
    'turn:timer': (payload: TurnTimerPayload) => void;
    'match:finished': (payload: MatchFinishedPayload) => void;
    error: (payload: z.infer<typeof errorPayloadSchema>) => void;
    'chat:message': (payload: ChatMessagePayload) => void;
    'pong:latency': (payload: PongLatencyPayload) => void;
}
