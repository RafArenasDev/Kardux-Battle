# ADR 0002: NestJS for the API, over a plain Node framework or a different language

## Status

Accepted

## Context

`apps/api` needs a REST layer (auth, matches, leaderboard, decks) and a stateful Socket.IO
gateway with an authoritative game loop, backed by Prisma (Postgres) and Redis. The codebase
also needs to stay approachable for a single-team monorepo where `@kardux/contracts` (Zod
schemas) is the source of truth for every DTO and socket payload on both sides.

## Decision

Use **NestJS** with its official `@nestjs/platform-socket.io` adapter.

- NestJS's module system maps directly onto the task breakdown in `TASK-01-backend.md`
  (`MatchModule`, `GameGateway`, `DeckModule`, `LeaderboardModule`, `AuthModule`) without
  inventing our own layering convention.
- A global Zod validation pipe replaces `class-validator` entirely, so `@kardux/contracts`'s
  schemas are the _only_ place a payload shape is defined — no drift between the DTO used by
  the gateway and the one the frontend imports.
- Built-in `SchedulerRegistry` gives named, cancellable timers for turn/match timeouts without
  a bespoke timer registry.
- Nest's testing module makes Supertest (REST) and `socket.io-client` (gateway) integration
  tests straightforward to wire against a real, in-process Nest application.

## Alternatives considered

- **Express/Fastify directly**: less ceremony, but we'd hand-roll dependency injection,
  module boundaries, and a testing harness that Nest already provides — not worth it for an
  API with five distinct modules plus a stateful gateway.
- **Laravel** (PHP): ruled out outright — the game engine must be pure TypeScript so
  `apps/web`, `apps/desktop`, and `apps/mobile` can all import `@kardux/engine` directly
  and predict outcomes optimistically. Splitting the engine (TS) from the API (PHP) would
  mean re-implementing the rules twice and risking them drifting apart.

## Consequences

- Request/response and socket payload validation both go through Zod pipes/interceptors, not
  `class-validator` decorators — any future contributor used to stock Nest tutorials needs
  this pointed out once.
- `MatchRuntimeService` (in-memory match state + Redis-backed lock) sits outside the regular
  request/response cycle and is documented separately in ADR 0004.
