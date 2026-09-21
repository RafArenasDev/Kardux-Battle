# Kardux Battle — progress & continuation log

> This file exists so any session (or any contributor) can pick up exactly where the last
> one left off, without re-reading the whole git history. Update it whenever a unit of work
> lands on `main`.

## Session 2026-09-21 — Phase 0: monorepo scaffold

**Merged to `main`** (commits `8daf860`..`5c54065`, then this recap on top):

- pnpm + Turborepo workspace; ESLint (flat config) + Prettier + Husky + Commitlint enforcing
  Conventional Commits.
- Five ADRs: monorepo tooling, NestJS over alternatives, the pure/deterministic rules engine,
  PostgreSQL + Redis (including why this machine's dev setup skips Docker), and API docs +
  HTTP client tooling.
- `packages/contracts`, `packages/engine`, `apps/api` scaffolded — `package.json` +
  `tsconfig.json` only, **no game logic yet**. Nothing here violates the "no empty stubs"
  rule because there's no source code at all yet, just build/dependency configuration.
- `apps/api`'s dependency versions were deliberately picked, not just `pnpm add`-ed blindly:
  NestJS pinned to `^11.2.5` (not the newly-released v12) because `nestjs-zod` — the package
  that generates OpenAPI docs directly from `@kardux/contracts`'s Zod schemas, so the docs
  never drift from validation — only declares peer support up to v11. `prisma` (the CLI) is
  pinned to `7.10.0` exactly, because npm's `latest` dist-tag for it currently points at an
  `8.0.0-rc.15` release candidate while `@prisma/client`'s `latest` is still `7.10.0` stable;
  installing without checking would have paired an RC CLI with a stable client.
- Local dev environment (this machine only — see ADR 0004): PostgreSQL 18 native, `kardux_dev`
  database created, connection verified with `psql`. Redis 8.10.1 installed via the
  open-source `redis-windows-fork` (no Docker, no account/license — explicit requirement).
- API documentation: `@nestjs/swagger` + `nestjs-zod`, OpenAPI generated straight from the
  same Zod schemas used for runtime validation. Bruno adopted as the HTTP client instead of
  Postman (free, open source, collections stored as text files in the repo) — see ADR 0005.
- `.env` (real local secrets, git-ignored) and `.env.example` (committed template, no real
  values) both exist under `apps/api/`.

### How to verify Phase 0 on a fresh clone

```bash
pnpm install
psql -U postgres -h localhost -c "SELECT 1"   # confirms Postgres reachable
redis-server                                    # keep running in its own terminal
pnpm -r list --depth -1                         # should list kardux-battle + 3 workspace packages
```

There is no application to run yet — Phase 0 is tooling and scaffolding only.

### A note on "I don't see it on GitHub"

The repository is **private**. A private repo returns the same "not found" page to anyone
not logged in as its owner as a repo that doesn't exist at all — that's GitHub's default
behavior, not a sign that a push failed. When in doubt, verify against the GitHub API
(`gh api repos/<owner>/<repo>/commits`) rather than a browser tab that might be in a
logged-out or different-account session.

## What's next (not started)

1. **Phase 1a** (`docs/tasks/TASK-01-backend.md`): real content for `@kardux/contracts` —
   `Card`, `Player`, `MatchConfig`, `MatchState`, `RedactedMatchState`, `RoundResult` types,
   Zod schemas for all of them, typed `ClientEvents`/`ServerEvents` socket event maps, typed
   error codes (`ERR_NOT_YOUR_TURN`, `ERR_MATCH_FULL`, `ERR_INVALID_CONFIG`, ...).
2. **Phase 1b**: real content for `@kardux/engine` — `createMatch`/`reduce`, seeded RNG
   (`sfc32`) + deterministic shuffle, the full rule set from `CLAUDE.md` (dealing, first-turn
   search order, attribute comparison, tie pot, elimination, turn/match timeouts, `redactFor`),
   and the exhaustive Vitest suite the coverage thresholds in `vitest.config.ts` are already
   wired for.
3. Only once the engine is green (per `README-COMO-USAR.md`'s own warning — debugging engine
   bugs through live sockets later is much worse): **Phase 2**, real `apps/api` code —
   Nest modules, the Socket.IO gateway, Prisma schema + migration, the Redis-backed per-room
   lock, guest JWT auth, and the first Bruno collection.

## Workflow for this project, going forward

One branch per unit of work → professional Conventional Commit(s) in English → push → PR →
merge to `main` → this file updated with what shipped and what's next. Phase 0's five scaffold
commits went straight to `main` (mirroring the user's own initial `git init`/`git push`
sequence for the empty repo); everything after this recap follows the branch → PR → merge
cycle instead.
