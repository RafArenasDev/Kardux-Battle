# ADR 0002: NestJS for the API

## Status

Accepted

## Context

`apps/api` needs a REST layer (auth, matches, decks, leaderboard, health), a stateful Socket.IO
gateway running an authoritative game loop, scheduled jobs, and access to PostgreSQL and Redis.
The Zod schemas in `@kardux/contracts` must remain the only definition of every payload.

## Decision

**NestJS** (Express platform) with the official Socket.IO adapter.

- Modules map one to one onto the domain: `AuthModule`, `MatchModule`, `GameModule` (gateway and
  `MatchRuntimeService`), `DeckModule`, `LeaderboardModule`, `MaintenanceModule`, `HealthModule`.
- `nestjs-zod` validates every request with the shared schemas, so there are no parallel
  `class-validator` DTOs that could drift from what the client imports.
- Dependency injection keeps the runtime testable: services are unit tested with a mocked
  Prisma client, and the gateway is tested end to end with `socket.io-client`.
- `@nestjs/schedule`, `@nestjs/throttler`, `@nestjs/jwt` and `nestjs-pino` cover jobs, rate
  limiting, auth and structured logs without custom infrastructure.

## Alternatives considered

- **Express or Fastify directly**: less ceremony, but dependency injection, module boundaries and
  a test harness would have to be built by hand.
- **A non-TypeScript backend**: the rules engine and contracts are TypeScript and shared with the
  client; a second language would mean implementing the rules twice.

## Consequences

- Validation goes through Zod, not the `class-validator` decorators most Nest tutorials use.
- `MatchRuntimeService` lives outside the request/response cycle: it owns live match state,
  timers and locks (see ADR 0003 and ADR 0004).
