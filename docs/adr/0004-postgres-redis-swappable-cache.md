# ADR 0004: PostgreSQL as the system of record, Redis as an optional live-state layer

## Status

Accepted

## Context

Durable data (accounts, rooms, rounds, ranking, the card pool) needs a relational store with
JSON columns and migrations. Live matches need something faster than the database for snapshots,
and concurrent actions on the same table must be serialized.

## Decision

- **PostgreSQL** through **Prisma** is the system of record, in development and production (no
  SQLite in development, so JSONB and partial-uniqueness behaviour are tested against the real
  engine). Migrations are versioned and always incremental.
- **Redis** (Valkey in production) stores a snapshot of each live match after every accepted
  action and a `SET NX PX` lock per match.
- Correctness never depends on Redis: an in-process async mutex per match already serializes
  actions on a single instance; the Redis lock is the extra guarantee for more than one instance.
  If Redis is unreachable the game keeps running from memory and the client reconnects on its own.

## Alternatives considered

- **Only PostgreSQL**: a write per action for snapshots would put the database on the hot path.
- **Only in-memory state**: a restart would wipe every live match, and nothing would serialize
  actions across instances.

## Consequences

- Local development needs PostgreSQL and, optionally, Redis; `pnpm dev` starts a local Redis if
  one is installed and not running.
- Production uses managed services on Aiven's free tier (PostgreSQL 1 GB and Valkey), which is why
  retention and a database size guard exist (see `docs/DEPLOY.md`).
