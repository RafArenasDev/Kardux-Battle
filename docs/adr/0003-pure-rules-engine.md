# ADR 0003: A pure, deterministic rules engine with no I/O

## Status

Accepted

## Context

The game runs on four platforms (`api`, `web`, `desktop`, `mobile`). The server must stay
authoritative — no client decides a round's outcome — but the web/desktop/mobile clients still
need to predict outcomes optimistically (e.g. animate a card flip before the server's
`round:resolved` event arrives) and the engine needs exhaustive, fast unit tests that never
touch a network or a clock.

## Decision

`@kardux/engine` is plain TypeScript with **zero runtime dependencies** beyond
`@kardux/contracts`'s types. It exposes:

- `createMatch(config, seed)` and `reduce(state, action, ctx)`, where `ctx = { now, rng }` is
  always injected — the engine never calls `Date.now()` or `Math.random()` internally.
- A seeded RNG (`sfc32`, seeded from a string via a small hash) and a deterministic
  Fisher-Yates `shuffle` built on it, so `createMatch(config, 'same-seed')` always produces the
  same deal.
- `redactFor(playerId, state)`, which is what actually enforces "no client sees another
  player's cards" — the server calls it once per socket before every broadcast, and it's unit
  tested exactly like the rest of the reducer.

`apps/api` is the only place that supplies real `now`/`rng`; `apps/web` (and later
`desktop`/`mobile`) import the same `reduce`/`redactFor` for optimistic UI, never a
reimplementation of the rules.

## Alternatives considered

- **Engine logic embedded in the NestJS gateway**: faster to write initially, but then the
  frontend can only predict outcomes by guessing, and testing a tie-pot edge case means
  spinning up sockets — exactly what `README-COMO-USAR.md` warns against ("depurarlos a través
  de sockets es un infierno").
- **A stateful class with internal `Date.now()`/`Math.random()`**: not deterministic, so a
  fixed-seed regression test (full match, reproducible) would be impossible, and so is
  replaying a `MatchEvent` log for debugging or spectating.

## Consequences

- Every engine function takes its inputs explicitly (state, action, `ctx`) — no hidden module-
  level state, no singletons.
- `apps/api`'s `MatchRuntimeService` owns the _only_ live `now`/`rng` instances per match and
  is responsible for injecting them into `reduce()` on every action.
