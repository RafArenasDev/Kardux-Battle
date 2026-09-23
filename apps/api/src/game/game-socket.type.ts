import type { ClientEvents, ServerEvents } from '@kardux/contracts';
import type { Socket } from 'socket.io';

/** Shared alias so `GameGateway` and `MatchRuntimeService` type socket parameters
 *  identically without one importing the other just for this. */
export type GameSocket = Socket<ClientEvents, ServerEvents>;
