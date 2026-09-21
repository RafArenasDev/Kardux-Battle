import type { Card, ErrorCode, Player, PublicRoundView, RoundResult } from '@kardux/contracts';

/**
 * What `reduce()` reports happened, in order - `apps/api`'s gateway maps each of these to the
 * matching `ServerEvents` broadcast (plus a fresh `match:state` redaction per socket after
 * processing). Kept distinct from `ServerEvents` itself because the engine doesn't know about
 * sockets, acks, or rooms - only what changed.
 */
export type EngineEvent =
    | { type: 'player.joined'; player: Player }
    | { type: 'player.left'; playerId: string }
    | { type: 'match.countdownStarted'; endsAt: number }
    | { type: 'match.countdownCancelled' }
    | { type: 'match.started' }
    | { type: 'round.started'; round: PublicRoundView }
    | { type: 'round.attributeSelected'; attribute: string }
    | { type: 'round.cardPlayed'; playerId: string }
    | { type: 'round.revealed'; cards: Record<string, Card> }
    | { type: 'round.resolved'; result: RoundResult }
    | { type: 'round.tie'; potSize: number }
    | { type: 'match.finished'; standings: Player[]; winnerId: string | null; isDraw: boolean }
    | { type: 'error'; code: ErrorCode; message: string };
