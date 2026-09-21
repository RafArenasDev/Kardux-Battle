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

## Session 2026-09-21 (cont'd) — `@kardux/contracts` shipped; README consolidated; card-mirror decision

**Merged to `main`**:

- **Phase 1a done**: `@kardux/contracts` real content — `Card`, `MatchConfig` (with the
  cross-field validation CLAUDE.md calls for), `Player`, `MatchState`/`RedactedMatchState`/
  `PublicRoundView`/`RoundResult`, typed error codes with es/en messages, and the full `/game`
  socket contract (`ClientEvents`/`ServerEvents`). 20 Vitest cases, all passing.
- **README.md rewritten as the single entry point** per explicit instruction — setup,
  architecture (with real Mermaid diagrams for the monorepo layout and the match state
  machine), tech stack + rationale (linking to ADRs for depth, not replacing this file with
  them), and current status all live directly in `README.md` now, not deferred to a future
  "docs phase." It gets updated every session, not written once at the end.
- **Architecture decision (ADR 0006)**: deck data will be mirrored into a local
  `CardPoolEntry` table per source (Postgres), refreshed by a scheduled sync job, instead of
  every match-creation calling the live external API. This makes deck building depend on our
  own database, not on a small community API's uptime — see `CLAUDE.md`'s updated "FUENTES DE
  CARTAS" section and ADR 0006 for the full design. **Not built yet** — this is a Phase 3
  (`packages/providers`) design decision, recorded now so it isn't lost before that phase
  starts.

## Session 2026-09-21 (cont'd) — `@kardux/engine` shipped: Phase 1 complete

**Merged to `main`**:

- **Phase 1b done**: `@kardux/engine` — seeded RNG (`cyrb128` + `sfc32`, pure functions over
  an explicit state tuple), shuffle-then-truncate dealing, the `1A, 1B, ...` first-turn
  search, round resolution (clear win / tie / chained ties / mid-round elimination), all
  three `onTurnTimeout` policies plus the card-play auto-play timeout, `matchDurationMs`
  expiry (winner or draw), and `redactFor`.
- 68 Vitest cases across 5 files, covering every named scenario from `TASK-01-backend.md`:
  a chained triple tie that ends with one player holding the whole deck, multi-player
  elimination in a single round, a non-divisible deck, a match finished by clock with a tied
  card count, all three turn-timeout policies, and a full match proven byte-for-byte
  reproducible from a fixed seed run twice. Coverage 95.4% statements / 85.5% branches / 97.5%
  functions (thresholds: 90/85/90).
- `MatchState` (in `@kardux/contracts`) gained two fields the engine needs to stay pure that
  the abbreviated task spec didn't spell out: `turnDeadline` and `roundIndex` (a durable round
  counter, since `round` itself goes back to `null` between rounds).
- **`packages/contracts` + `packages/engine` are both fully done and green.** This was the
  explicit gate before touching `apps/api` (`README-COMO-USAR.md`'s own warning: debugging
  engine bugs through live sockets is much worse) — that gate has been met.

## What's next (not started)

1. **Phase 2** (`docs/tasks/TASK-01-backend.md`, part 2): real `apps/api` code — `AuthModule`
   (guest JWT), `MatchModule` + `MatchRuntimeService` (in-memory match state + Redis-backed
   per-room lock, injecting `@kardux/engine`'s `reduce()`), `GameGateway` (Socket.IO namespace
   `/game`, handshake validates JWT + tabId), `DeckModule`/`LeaderboardModule` stubs, Prisma
   schema + first migration, Swagger/`nestjs-zod` docs wiring, the first Bruno collection, and
   `docker-compose.yml`. **This is also when the README's "Run it" section gets the real
   command** to launch the API - promised, not delivered yet.
2. **Phase 3** (`packages/providers`) includes the `CardPoolEntry` mirror + sync job from
   ADR 0006, in addition to the provider adapters `TASK-02-providers.md` already describes.

## Workflow for this project, going forward

One branch per unit of work → professional Conventional Commit(s) in English → push → PR →
merge to `main` → this file updated with what shipped and what's next. Phase 0's five scaffold
commits went straight to `main` (mirroring the user's own initial `git init`/`git push`
sequence for the empty repo); everything after this recap follows the branch → PR → merge
cycle instead.
