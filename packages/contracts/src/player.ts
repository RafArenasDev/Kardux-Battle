import { z } from 'zod';

/**
 * Public metadata about a match participant - safe to show every viewer, including
 * rivals. Never carries the player's actual cards (see `MatchState.piles` /
 * `RedactedMatchState.yourTopCard` in `match-state.ts`); `cardCount` is the only
 * card-related fact everyone gets to see, matching CLAUDE.md's "arco de rivales
 * (avatar, nickname, contador de cartas, ...)".
 */
export const playerSchema = z.object({
    /** Opaque identifier assigned by whoever calls the engine (the API layer uses its
     *  `userId:tabId` playerKey here - the engine itself doesn't know or care about the
     *  shape, it's just a string it can compare for equality). */
    id: z.string().min(1),
    nickname: z.string().min(1).max(24),
    avatarSeed: z.string().min(1),
    joinOrder: z.number().int().min(0),
    seat: z.number().int().min(0),
    isSpectator: z.boolean(),
    isEliminated: z.boolean(),
    eliminatedAt: z.number().int().nullable(),
    cardCount: z.number().int().min(0),
});

export type Player = z.infer<typeof playerSchema>;
