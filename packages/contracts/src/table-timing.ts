/**
 * How long the table choreography takes, shared by the engine (when a turn opens), the API
 * (when the practice rival may act) and the web client (how it paces its animations). One
 * source of truth is what stops a new round from starting while the previous one is still on
 * screen - and it keeps every step a clear beat after the previous one, never all at once.
 */
export const TABLE_TIMING = {
    /** Shuffle + deal at the start of a match. */
    dealMs: 4_200,
    /** The last card finishes landing on the table, face down. */
    landMs: 800,
    /** One card flip, and the gap before the next player's card flips. */
    flipMs: 900,
    flipStaggerMs: 300,
    /** The winning card glows (the rest dim) before anything is announced. */
    compareMs: 1_300,
    /** The result banner stays on the table. */
    bannerMs: 1_900,
    /** The cards fly to the winner's pile (or into the pot). */
    collectMs: 1_100,
} as const;

/** When each step of a round's reveal starts, in ms after the round resolved. */
export interface RevealSchedule {
    flipAt: number;
    compareAt: number;
    resultAt: number;
    collectAt: number;
    doneAt: number;
}

/** The reveal timeline for a round with `cardCount` cards on the table: more players, more
 *  flips, so every later step shifts accordingly. */
export function revealSchedule(cardCount: number): RevealSchedule {
    const t = TABLE_TIMING;
    const flipAt = t.landMs;
    const compareAt = flipAt + t.flipMs + t.flipStaggerMs * Math.max(0, cardCount - 1);
    const resultAt = compareAt + t.compareMs;
    const collectAt = resultAt + t.bannerMs;
    const doneAt = collectAt + t.collectMs;
    return { flipAt, compareAt, resultAt, collectAt, doneAt };
}
