import type { RngState } from '@kardux/contracts';

/**
 * cyrb128: hashes an arbitrary string into four 32-bit integers, used to seed `sfc32` below.
 * Public-domain algorithm (bryc's well-known JS PRNG seeding recipe) - picked because it's
 * small, has no dependencies, and is deterministic across platforms (only 32-bit integer
 * math, `Math.imul`).
 */
function cyrb128(seed: string): RngState {
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;

    for (let i = 0; i < seed.length; i++) {
        const k = seed.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }

    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;

    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Derives the initial RNG state from a match seed string. Two matches created with the same
 *  `config.seed` (or the same auto-generated seed) deal, shuffle, and resolve every timeout
 *  identically - the "partida completa reproducible con semilla fija" test relies on this. */
export function createRngState(seed: string): RngState {
    return cyrb128(seed);
}

/**
 * One step of `sfc32` (Small Fast Counter, 32-bit) - a widely used, statistically solid PRNG
 * for game logic (not cryptography). Written as a pure function over an explicit state tuple,
 * not a closure holding mutable variables, so the *next* state can be persisted as part of
 * `MatchState` (ADR 0003: the engine never holds any state `reduce()` doesn't return).
 */
export function nextRandom(state: RngState): [number, RngState] {
    let [a, b, c, d] = state;
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;

    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;

    const value = (t >>> 0) / 4294967296;

    return [value, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

/** A random integer in `[0, max)`. Used for turn-timeout's `random_attr` policy. */
export function nextInt(max: number, state: RngState): [number, RngState] {
    const [value, nextState] = nextRandom(state);

    return [Math.floor(value * max), nextState];
}

/** Deterministic Fisher-Yates shuffle threading the RNG state through instead of mutating a
 *  module-level generator - the result depends only on `items` and `state`, nothing else. */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
    const result = [...items];
    let currentState = state;

    for (let i = result.length - 1; i > 0; i--) {
        const [randomValue, nextState] = nextRandom(currentState);
        currentState = nextState;
        const j = Math.floor(randomValue * (i + 1));
        const tmp = result[i]!;
        result[i] = result[j]!;
        result[j] = tmp;
    }

    return [result, currentState];
}
