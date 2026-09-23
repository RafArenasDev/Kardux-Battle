# ADR 0004: PostgreSQL + Redis, with a swappable cache/lock layer for local dev

## Status

Accepted

## Context

`docs/SPEC.md` specifies PostgreSQL (via Prisma) as the system of record and Redis for three
distinct jobs: deck cache (24h TTL, so a match survives an external API outage), a per-room
lock so concurrent socket actions on the same match are serialized, and the Socket.IO Redis
adapter for horizontal scaling. Local development on this machine has PostgreSQL 18 installed
natively, but no Redis, no Docker, and no WSL2 — and the project must stay entirely free and
license-free (no Memurai/Laragon-style registration).

## Decision

- **PostgreSQL**: connect to the local native instance in dev
  (`DATABASE_PROVIDER=postgresql`), matching production. `DATABASE_PROVIDER=sqlite` (already
  allowed by `docs/SPEC.md`) is _not_ used, since a real local Postgres is available — no reason
  to test against a different engine than production.
- **Redis**: installed locally via the open-source, MSYS2-packaged
  `redis-windows-fork` (upstream Redis 8.10.1, dual/triple-licensed including AGPLv3 as of
  Redis 8 — genuinely free and open source, no account or key required), run as a plain local
  process (`redis-server`). This is the _real_ Redis, not a substitute — `docker-compose.yml`
  (a `TASK-01` deliverable) still exists and is what a fresh machine or CI uses; installing
  Redis natively here just avoids a Docker dependency on this particular dev machine.
- Both `DeckCache` and the per-room match lock are still defined as interfaces (`DeckCache`,
  `MatchLock`) with the Redis implementation as the only one shipped — there is no in-memory
  fallback in the codebase, since real Redis is available and free. Keeping the interface
  (rather than calling `ioredis` directly from business logic) is what makes it possible to
  point at a different Redis instance (Docker, a managed service) later with a one-line env
  change, and to unit-test `MatchRuntimeService` without a live Redis in CI if that's ever
  needed.

## Alternatives considered

- **SQLite for dev**: rejected — PostgreSQL is already installed natively and matches
  production; testing against SQLite would risk Postgres-specific bugs (JSONB columns, the
  partial unique index on `Match.code`) surfacing only in production.
- **Memurai / Laragon-bundled Redis**: rejected per explicit instruction — both require account
  registration or a license, which conflicts with "everything free, open source."
- **No Redis at all (pure in-memory cache/lock)**: rejected once real Redis was installed —
  an in-memory lock does not serialize actions across multiple API instances, which is the
  actual production requirement `MatchRuntimeService` needs to prove out.

## Consequences

- `.env` (git-ignored) holds the real local Postgres credentials and `REDIS_URL`; `.env.example`
  documents every variable without real values.
- Anyone else cloning the repo without native Postgres/Redis should still use
  `docker compose up -d` (Postgres + Redis) as documented in the README — this ADR only
  explains why _this_ machine's dev setup looks different from that default path.
