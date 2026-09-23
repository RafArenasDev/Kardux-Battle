import type { Card, MatchConfigPatch } from '@kardux/contracts';

/**
 * Every state transition the engine can be asked to make. This is intentionally a smaller,
 * lower-level surface than the `/game` socket contract in `@kardux/contracts` - `apps/api`'s
 * gateway is what translates a validated `ClientEvents` payload (which also carries auth,
 * rate limiting, etc.) into one of these. The engine itself doesn't know about sockets, JWTs,
 * or rooms; it only knows player ids as opaque strings.
 *
 * `deck` arrives already built (packages/providers, async I/O) - the engine never fetches or
 * generates cards itself (ADR 0003).
 *
 * `system.tick` carries no data of its own; it exists so the API can force the engine to
 * re-check time-based transitions (match duration, turn timeout, countdown elapsing) purely
 * from `ctx.now`, without a "real" player action having happened.
 */
export type EngineAction =
    | { type: 'player.join'; playerId: string; nickname: string; avatarSeed: string }
    | { type: 'player.leave'; playerId: string }
    | { type: 'match.configure'; playerId: string; patch: MatchConfigPatch }
    | { type: 'match.start'; playerId: string; deck: Card[] }
    | { type: 'match.beginCountdown'; deck: Card[] }
    | { type: 'match.cancelCountdown'; playerId: string }
    | { type: 'round.selectAttribute'; playerId: string; attribute: string }
    | { type: 'round.playCard'; playerId: string; cardCode?: string }
    | { type: 'system.tick' };

export interface EngineContext {
    /** Injected, never read from `Date.now()` inside the engine (ADR 0003). */
    now: number;
}
