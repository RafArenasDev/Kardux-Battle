/**
 * Client/server clock offset, estimated from round-trip `ping:latency` / `pong:latency`
 * samples (see `useMatchSession`). Every deadline the server sends (`turnOpensAt`,
 * `turnDeadline`, ...) is a server timestamp; comparing it against a raw `Date.now()` breaks
 * as soon as the device clock drifts from the server's, which is exactly what silently kept
 * the round leader from ever seeing their attribute buttons enable.
 */

let offsetMs = 0;

/** Best estimate of the server's `Date.now()` right now. */
export function serverNow(): number {
    return Date.now() + offsetMs;
}

/**
 * Feeds one round-trip sample: `t` is the local time the `ping:latency` was sent, `serverTime`
 * is what the server answered with in `pong:latency`. Keeps the sample with the lowest
 * round-trip time, since that one has the least queuing/network jitter and is the closest
 * estimate of "server time at the instant `pong:latency` was measured".
 */
let bestRoundTripMs = Infinity;

export function recordServerTime(t: number, serverTime: number): void {
    const now = Date.now();
    const roundTripMs = now - t;
    if (roundTripMs < 0 || roundTripMs > bestRoundTripMs) return;
    bestRoundTripMs = roundTripMs;
    // The server measured `serverTime` roughly half the round trip after `t` was sent.
    offsetMs = serverTime + roundTripMs / 2 - now;
}

/** Test-only: resets the module's offset/best-sample state between test cases. */
export function resetClockForTests(): void {
    offsetMs = 0;
    bestRoundTripMs = Infinity;
}
