/**
 * How long the table choreography takes, shared by the engine (when a turn opens), the API
 * (when the bot may act) and the web client (how it paces its animations). Keeping one source
 * of truth is what stops a new round from starting while the previous one is still on screen.
 */
export const TABLE_TIMING = {
    /** Shuffle + deal at the start of a match. */
    dealMs: 4_200,
    /** After a round resolves: the last card lands, every card flips, the result banner, then
     *  the cards are collected. The next turn opens only when all of it has played out. */
    revealMs: 5_800,
} as const;
