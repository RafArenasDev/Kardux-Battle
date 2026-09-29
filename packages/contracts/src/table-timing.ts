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
    /** The result banner stays on the table before the cards fly to the winner. */
    bannerMs: 2_600,
    /** The cards fly to the winner's pile (or into the pot). */
    collectMs: 1_100,
    /** A breather between one stage settling and the next one starting, so each beat (land,
     *  flip, compare, banner, collect) reads as its own moment - long enough to actually read
     *  the message that stage shows, not just notice it flashed by. */
    stageGapMs: 600,
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
 *  flips, so every later step shifts accordingly. Each step starts `stageGapMs` after the
 *  previous one visually settles, not the instant it does. */
export function revealSchedule(cardCount: number): RevealSchedule {
    const t = TABLE_TIMING;
    const flipAt = t.landMs + t.stageGapMs;
    const compareAt =
        flipAt + t.flipMs + t.flipStaggerMs * Math.max(0, cardCount - 1) + t.stageGapMs;
    const resultAt = compareAt + t.compareMs + t.stageGapMs;
    const collectAt = resultAt + t.bannerMs + t.stageGapMs;
    const doneAt = collectAt + t.collectMs;
    return { flipAt, compareAt, resultAt, collectAt, doneAt };
}
