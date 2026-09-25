# ADR 0003: A pure, deterministic rules engine with no I/O

## Status

Accepted

## Context

The server is authoritative: no client decides a round. The rules have many edge cases (chained
ties, knock-outs mid-round, decks that do not divide evenly, time-outs, players leaving a duel or
a larger table) and they must be tested quickly and exhaustively, without sockets, databases or
clocks.

## Decision

`@kardux/engine` is plain TypeScript whose only dependency is `@kardux/contracts`. It exposes:

- `createMatch(config, { seed, now })` and `reduce(state, action, { now })`, returning the next
  state plus the list of events that happened. Time is always injected; the engine never calls
  `Date.now()` or `Math.random()`.
- A seeded RNG (`cyrb128` + `sfc32`) whose state is part of `MatchState`, and a deterministic
  Fisher-Yates shuffle, so the same seed always produces the same deal.
- `redactFor(playerId, state)`, which enforces that no player ever receives another player's
  cards. The server calls it once per socket before every broadcast.
- `ratingChanges` / `placementsOf`, the multiplayer Elo used by the ranking.

## Alternatives considered

- **Rules inside the NestJS gateway**: quicker at first, but testing a tie-pot edge case would
  mean spinning up sockets.
- **A stateful class using the real clock and `Math.random()`**: not deterministic, so a
  reproducible full-match test or a replay from the `match_events` log would be impossible.

## Consequences

- Every engine function receives its inputs explicitly; there is no module-level state.
- `MatchRuntimeService` in `apps/api` is the only caller of `reduce()` and the only place that
  supplies the real time.
- The engine suite (80 tests) has enforced coverage thresholds of 90 % lines and 85 % branches.
