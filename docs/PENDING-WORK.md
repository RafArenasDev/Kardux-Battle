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

## Session 2026-09-21 (cont'd) — Phase 2a: `apps/api` actually boots

Split off Phase 2 on purpose, to land a complete, working slice before the session's usage
window reset rather than leaving Phase 2 half-built mid-way (CLAUDE.md: "código completo o
nada"). **Merged to `main`**:

- `apps/api` is a real, runnable NestJS app: `pnpm --filter @kardux/api dev` boots it on
  `http://localhost:3000` with structured Pino logging, Helmet, CORS (origins from
  `CORS_ORIGINS`), global rate limiting (`@nestjs/throttler`, limits from `.env`), and
  `GET /health`.
- `.env` is validated in full at boot via Zod (`src/config/app-config.ts`) - every field in
  `.env.example`, even `DB_*`/`REDIS_URL` which nothing consumes yet, so a misconfigured
  `.env` fails immediately with one clear error instead of a confusing crash three requests
  in once Prisma/Redis land.
- Swagger UI at `/api/docs` (and raw JSON at `/api/docs-json`), wired through `nestjs-zod`'s
  `cleanupOpenApiDoc` (not the `patchNestJsSwagger` ADR 0005 originally named - that function
  doesn't exist in the installed `nestjs-zod@5.5.0`; `cleanupOpenApiDoc` is that version's
  actual mechanism for the same job, applied to the built document instead of monkey-patching
  `@nestjs/swagger` ahead of time).
- First Bruno collection (`apps/api/bruno/`) with a `local` environment and the health check
  request.
- Verified for real, not just "tests pass": ran `pnpm --filter @kardux/api dev`, confirmed the
  Pino startup log, `curl`'d `/health` and `/api/docs-json`, both responded correctly, then
  stopped the process before committing.
- README's "Run it" section now has the actual command, replacing the placeholder.

**Deliberately not in this slice** (real DI/config-dependent work, saved for Phase 2b so
Phase 2a could land clean and complete): `AuthModule` (guest JWT), `MatchModule` +
`MatchRuntimeService` (in-memory match state + Redis-backed per-room lock, injecting
`@kardux/engine`'s `reduce()`), `GameGateway` (Socket.IO namespace `/game`), Prisma schema +
first migration, `DeckModule`/`LeaderboardModule`. None of these exist yet.

One thing to pick up when Phase 2b starts: `apps/api/vitest.config.ts` notes that Nest's DI
needs `emitDecoratorMetadata`-aware test transform (`unplugin-swc`, not Vitest's default
esbuild) the moment a test needs to resolve a constructor-injected dependency - not needed for
the health check (no constructor args), but `AuthModule`/`MatchModule`'s services will need it.

## Session 2026-09-21 (cont'd) — Phase 2a.2: Prisma schema, migration, dev seed

Another deliberately small, complete slice under the same time pressure. **Merged to `main`**:

- `apps/api/prisma/schema.prisma`: all 7 models from CLAUDE.md's "BASE DE DATOS" section
  (`User`, `Match`, `MatchPlayer`, `Round`, `DeckSnapshot`, `LeaderboardStat`, `MatchEvent`).
  `Match.code` is deliberately not schema-unique - CLAUDE.md only requires uniqueness among
  _active_ matches, which Prisma's declarative schema can't express as a partial index; that
  rule is `MatchModule`'s job (Phase 2b), not the DB's.
- **Real breaking change hit and worked around**: `prisma`/`@prisma/client` were on `7.10.0`
  (Phase 0's pin). Prisma 7 removed the datasource `url` field from `schema.prisma` entirely -
  connections now need a separate `prisma.config.ts` plus a runtime driver adapter. Adopting
  that properly was out of scope for the time available, so both packages were downgraded to
  `6.19.3` (the last 6.x, still using the classic `url = env("DATABASE_URL")` pattern). Revisit
  the Prisma 7 config model later, deliberately, not by accident.
- Migration `20260921174701_init` applied and verified for real against the local Postgres:
  `psql \dt` confirmed all 7 tables exist.
- `prisma/seed.ts` (4 guest users + a starting `LeaderboardStat` row each) run for real - rows
  confirmed with a direct `SELECT`, not just "the script exited 0."
- `apps/api/bruno/README.md`: a walkthrough for actually opening the Bruno collection, picking
  the `local` environment, and sending the health check request - written because the
  collection by itself wasn't self-explanatory enough to use unassisted (confirmed live: the
  user had Bruno open but couldn't figure out collection/environment setup, and separately
  hit Swagger while the API happened to be stopped).

## Session 2026-09-21 (cont'd) — First real deployment: Aiven + Render

Explicit ask: get the API online somewhere real, on free tiers, with data survivable in the
cloud - not just local. Done, verified live, **not merged as code** (no repo changes; this is
infrastructure state, tracked here since there's nothing to commit):

- **Database**: Aiven PostgreSQL, free tier ("Gratis-1-1gb": 1 CPU / 1GB RAM / 1GB storage,
  free forever, auto-suspends when idle). Service name `kardux-battle`, region North America
  (DigitalOcean `sfo`). Migration `20260921174701_init` applied (`prisma migrate deploy`) and
  the dev seed run against it - verified for real with `psql \dt` and a direct `SELECT`, same
  standard as local.
- **Cache**: Aiven Valkey (Redis-compatible), also free tier, service name
  `kardux-battle-cache`, same region. Nothing in the app talks to it yet (Phase 2b), but
  `REDIS_URL` needs to resolve to something real once `MatchRuntimeService` exists.
- **API**: deployed to Render as a Web Service (free tier: 0.1 CPU / 512MB RAM, auto-sleeps
  after inactivity, ~50s+ cold-start delay on the next request) - picked over Vercel
  specifically because it runs a real persistent Node process, which the Socket.IO gateway
  (Phase 2b) needs; Vercel's serverless functions don't hold a long-lived connection the way
  a game's real-time gateway requires. Connected directly to the private GitHub repo (already
  authorized in this Render account). Root directory left at the repo root on purpose (not
  `apps/api`) so a change to `packages/engine`/`packages/contracts` still triggers a redeploy;
  build command runs `pnpm --filter @kardux/api... build` (builds the workspace dependencies
  first), start command is `node apps/api/dist/main.js`.
- **Verified live, not just "deploy succeeded"**: `curl`'d
  `https://kardux-battle.onrender.com/health` and `/api/docs` after the deploy finished - both
  responded correctly.
- **Explicitly deferred** (per instruction - "al final pulimos toda la parte online"): the
  real-query keep-alive trigger for both Aiven services (a ping alone isn't reliable enough,
  per explicit feedback - needs an actual query, e.g. `SELECT count(*) FROM "User"` /
  a Valkey `PING`+`SET`/`GET`, on a schedule via GitHub Actions so it doesn't depend on Render
  itself being awake). Not built yet - the DBs may go idle again before this lands, which is
  fine, they wake back up on the next real connection attempt (just slower).
- Real secrets for the deployed environment live in `apps/api/.env.production` (git-ignored,
  local reference only - Render's own dashboard is the actual source of truth for its env
  vars, this file just avoids having to re-derive them by hand later).

## 2026-09-21 - Phase 2b, part 1: guest auth + REST endpoints (merged, PR #10)

Shipped, all on real local Postgres, `pnpm --filter @kardux/api typecheck|lint|test|build`
green:

- `AuthModule`: `POST /auth/guest` mints a guest JWT (no accounts/passwords), user's
  `avatarUrl` derived from `avatarSeed` via DiceBear (MIT, free, no API key) - not persisted,
  computed on every response so swapping the provider later needs no migration.
- `JwtAuthGuard` + `@CurrentUser()` decorator (hand-rolled `JwtService.verifyAsync`, no
  `passport`/`passport-jwt` dependency) for REST endpoints that need the caller's identity.
- `MatchModule`: `POST /matches` (host-only, JWT-guarded) reserves a `LOBBY` room and
  generates its 6-char code; `GET /matches/public`, `GET /matches/:code` look one up. This is
  the room-reservation layer only - live engine state (piles, turn order, RNG) still doesn't
  exist until `MatchRuntimeService`/`GameGateway` boot a match for real play (still pending,
  see below).
- `DeckModule`: `GET /decks/sources` - static catalog of the 10 providers CLAUDE.md
  documents. Only `local` is `ready: true` today; the rest are metadata until
  `packages/providers` (Phase 3) exists.
- `LeaderboardModule`: `GET /leaderboard` - global Elo ranking, real keyset pagination
  (`elo desc, id desc`, opaque base64url cursor). Per-source/period/friends filters from
  CLAUDE.md are NOT implemented - they'd need new columns/tables that aren't approved yet.
- Global `KarduxError` + exception filter mapping `@kardux/contracts`'s typed error codes to
  HTTP responses.
- **Fixed a real regression**: an earlier `eslint --fix` run rewrote DI-critical imports
  (`JwtService`, `PrismaService`, cross-module service imports) to `import type`, which
  erases the `design:paramtypes` metadata NestJS needs to resolve constructor-injected
  dependencies - the app crashed at boot with `UnknownDependenciesException`. Fixed by
  reverting to value imports with an inline `eslint-disable` + comment on each one (the
  linter can't distinguish a real DI dependency from a type-only parameter annotation, so
  this will keep coming up in every new injectable - the comment explains why so nobody
  "fixes" it again).
- **Decision (see CLAUDE.md)**: Swagger docs switched from the originally-planned bilingual
  ES/EN text to English-only - it read as cramped in Swagger UI with both languages
  concatenated in one description block.

## What's next (not started)

1. **Phase 2b, part 2 - the actual game loop**: `MatchRuntimeService` (in-memory match state
    - Redis-backed per-room lock, wired to `@kardux/engine`'s `reduce()`) and `GameGateway`
      (Socket.IO namespace `/game` - handshake, `playerKey = userId:tabId`, rooms per
      `matchId`, redacted broadcasts, reconnection grace). This is the biggest remaining piece
      and the one that makes a match actually playable end to end - REST only reserves rooms
      today, nothing deals cards or resolves a round yet.
2. Manual API testing docs: a curl-based walkthrough + Postman collection/environment setup
   guide in the README (deferred this session for time; the endpoints themselves are done and
   documented in Swagger at `/api/docs`). **Done** — see the 2026-09-21 "Bruno replaced with a
   local Postman collection" entry below.
3. Once the gateway is real: the GitHub Actions keep-alive workflow for Aiven, and
   `docker-compose.yml` for anyone without native Postgres/Redis.
4. **Phase 3** (`packages/providers`) includes the `CardPoolEntry` mirror + sync job from
   ADR 0006, in addition to the provider adapters `TASK-02-providers.md` already describes -
   this is what would flip the other 9 deck sources from `ready: false` to `true`.
5. Revisit Prisma 7's `prisma.config.ts` + driver-adapter model deliberately, once there's
   time to do it properly instead of downgrading again.

## 2026-09-21 (cont'd) — Bruno replaced with a local Postman collection

Reversal of part of ADR 0005 (see that file's own "Reverted" note for the full reasoning).
Bruno was adopted for manual API testing back in Phase 0 specifically to avoid Postman's
account/cloud-sync friction, but it didn't work out in practice for the project owner, who
installed Postman (free-tier account) instead. Done in this session:

- `apps/api/bruno/` deleted entirely (all `.bru` files + its README).
- `apps/api/postman/kardux-api.postman_collection.json` (Postman Collection Schema v2.1)
  added instead — covers all 6 REST endpoints from `API-TESTING.md`, including the
  documented error-case requests (missing-auth 401, impossible-config 400, nonexistent-code 404) as separate saved requests. Uses `{{base_url}}`/`{{token}}` collection variables; the
  "Create a guest identity" request has a test script that auto-extracts
  `response.json().token` into the `token` variable so authenticated requests need no manual
  copy/paste.
- `apps/api/postman/kardux-local.postman_environment.json` added alongside it
  (`base_url = http://localhost:3000`, empty `token`).
- `API-TESTING.md`, `README.md` updated to reference the Postman collection instead of Bruno.
- Both files are plain local JSON, importable manually — no Postman cloud/team workspace
  required, matching the project's "no forced account/sync" rule as closely as Postman's
  free tier allows.

## Session 2026-09-21 (cont'd) — match:mine + join-approval flow: INCOMPLETE, stopped mid-work

Ran out of session budget. **Nothing here is committed** — all changes are sitting in the
working tree, untested end-to-end, do not trust them without review. Was building (approved
design, not redesigned by the agent):

- `GET /matches/mine` (host + player matches, role-tagged).
- Join-request/approval flow: direct `match:join` (code/link) = instant `APPROVED`; discovery
  join from `GET /matches/public` = new `match:requestJoin` → `PENDING` → host
  `match:respondJoin` accepts/rejects. Auto-reject with `ERR_MATCH_FULL` if capacity (counting
  only `APPROVED` players) is already hit, no admin round-trip.
- Prisma: new `MatchPlayerStatus` enum (`PENDING`/`APPROVED`/`REJECTED`) + `status` on
  `MatchPlayer`, default `APPROVED`. Migration exists on disk
  (`20260922023701_add_match_player_status`) but **was it ever run against the dev DB? verify
  before trusting the schema state.**
- First `GameGateway` (`apps/api/src/game/`, new — the socket `/game` namespace didn't exist
  before this).
- New files not yet reviewed: `packages/contracts/src/match.test.ts`,
  `packages/contracts/src/socket-events.test.ts` (+ edits to the non-test versions of both).

**Killed while debugging a failing test**: agent's own last note before being stopped —
"`autoStartPlayers` default is 7, which exceeds `maxPlayers=2`. Let me fix `createMatch` to
also pass a matching `autoStartPlayers`." — i.e. a test/seed config mismatch it hadn't finished
fixing. **Assume the test suite does not pass yet.**

### Next session: do this first

1. `git status` / `git diff` to see the actual full diff (this recap is from file names only,
   not content review).
2. Finish or redo the `autoStartPlayers`/`maxPlayers` test fix the agent was mid-way through.
3. Run the full test suite for `apps/api` and `packages/contracts` before touching anything
   else — don't assume any of this works.
4. Confirm the Prisma migration actually applied cleanly to the dev DB.
5. Only after it's green: commit (Conventional Commits, one logical unit at a time per this
   project's own rule) and open the PR.

## Session 2026-09-21 (cont'd) — tcg-github-sync (separate repo) data status

Separate repo (`C:\Users\usuario\Documents\RAFA\DEV\tcg-github-sync`, its own GitHub repo
`FlakoArenas26/tcg-github-sync`) syncs card data for this game to consume later as a
`DeckProvider` (not wired into Kardux yet — that's Phase 3 in `docs/tasks/TASK-02-providers.md`,
not started). Current data state there, for whenever that phase starts:

- `pokeapi` (1,351 pokemon) and `deckofcardsapi` (54-card standard deck) — **fully synced**.
- `apitcg` (curated to 14 recognizable TCGs, see `SELECTED_TCGS` in that repo's `sync.py`) —
  **only ~45/220 Pokemon-TCG sets done, the other 13 TCGs untouched.** Blocked on apitcg's
  free-tier monthly quota (1,000 requests, already exhausted this month). The sync script is
  resume-safe — re-running `python sync.py` there picks up exactly where it left off, no
  wasted requests. Owner still deciding: wait for next month's quota reset, upgrade to a paid
  apitcg plan, or trim scope further per-TCG (only recent/iconic sets instead of full history).
- Until apitcg fills in, the game can already build fully-working `pokeapi` and
  `deckofcards`-backed decks — no reason to block other work on the missing TCGs.

## Session 2026-09-22 — Bearer lock-down on every REST endpoint + real deck catalog

**Not committed yet, sitting in the working tree.** Explicit ask: no REST endpoint may be
callable anonymously ("even public rooms must ask for the bearer"), and `GET /decks/sources`
must stop returning invented/static data and actually read `tcg-github-sync`.

- **Auth lock-down**: `JwtAuthGuard` + `@ApiBearerAuth()` added to every endpoint that was
  still open - `GET /decks/sources`, `GET /leaderboard`, `GET /matches/public`,
  `GET /matches/:code` (`apps/api/src/match/match.controller.ts`,
  `apps/api/src/leaderboard/leaderboard.controller.ts`,
  `apps/api/src/leaderboard/leaderboard.module.ts` now imports `AuthModule`). Deliberately
  still open: `POST /auth/guest` (it mints the token - can't require one to get one) and
  `GET /health` (infra probe). The Socket.IO `/game` namespace (`apps/api/src/game/`) already
  required a verified bearer token in its handshake before this session - no gap there.
- **Real deck catalog, no static data**: `apps/api/src/deck/github-sync.client.ts` (new) reads
  the live `tcg-github-sync` manifest (`https://raw.githubusercontent.com/FlakoArenas26/
tcg-github-sync/main/data/manifest.json` by default, overridable via the new
  `GITHUB_SYNC_BASE_URL` env var in `apps/api/src/config/app-config.ts` /
  `apps/api/.env.example`) with an in-memory TTL cache (5 min manifest, 15 min per-deck JSON -
  no Redis/DB mirror yet, that's still ADR 0006's fuller design). `deck.service.ts` was
  rewritten to build `GET /decks/sources`'s response entirely from that manifest: only
  `pokeapi`, `deckofcards`, `apitcg` appear, each with a real `cardCount` and a 4-card
  `preview` (`name`/`imageUrl`) pulled from the actual synced JSON. The previous static
  `DECK_SOURCES` array (which listed `local`, `dragonball`, `naruto`, `digimon`, `rickmorty`,
  `swapi`, `superheroes`, `marvel`, `transformers` as fake catalog rows, none backed by any
  real data) is gone entirely - a source with nothing synced simply doesn't appear in the
  response anymore, instead of appearing as a fabricated `ready: false` placeholder.
  `apps/api/src/deck/deck.controller.ts` and `deck.module.ts` updated to match (async
  `listSources()`, `GithubSyncClient` registered as a provider, `AuthModule` imported for the
  new guard).
- **Contract changes** (`packages/contracts/src/card.ts`, `packages/contracts/src/
deck-source.ts`): `DECK_SOURCE_IDS` gained `deckofcards` and `apitcg` (additive, matches
  what `tcg-github-sync` actually syncs); `DeckSourceDescriptor` gained `cardCount` and
  `preview` (new `deckPreviewCardSchema`).
- Verified: `pnpm --filter @kardux/contracts build`, `pnpm --filter @kardux/api typecheck`,
  `pnpm --filter @kardux/api lint` all green (0 errors - two pre-existing unrelated warnings
  in `game.gateway.spec.ts` from the prior incomplete session, not touched here).
- **Not done in this slice**: end-to-end verification with the API actually running against
  real Postgres/Redis (separate check, in progress as of this entry); the poker-manifest
  double-`data/` bug in the reference snippet the project owner pasted (`BASE + "/" + path`
  where `path` already starts with `"data/"`) was caught and NOT reproduced -
  `GithubSyncClient.getDeck()` strips the duplicate segment before fetching.

## Decisiones de arquitectura grandes pendientes de aprobación (2026-09-22)

Dos ideas que el dueño del proyecto planteó en la misma sesión, deliberadamente **no**
diseñadas ni implementadas todavía - son bifurcaciones de arquitectura reales, no ajustes
puntuales, y este proyecto trabaja por fases con "ok" explícito antes de empezar una (ver
`CLAUDE.md`, "Convenciones de trabajo").

1. **Persistencia offline (SQLite + PWA)**: cuando no haya conectividad (WiFi/datos/cable),
   el juego debería poder seguir funcionando con un respaldo local en SQLite en vez de
   depender de Postgres/`tcg-github-sync` en vivo. Encaja con la sección "MULTIPLATAFORMA" de
   `CLAUDE.md` (PWA instalable, offline shell) pero abre preguntas de diseño reales: ¿el
   SQLite vive en el cliente (p. ej. `sql.js`/wasm) o es el backing real detrás del
   `DeckSourceId` `local` que hoy no tiene ningún dato?, ¿cómo se sincroniza con Postgres
   cuando vuelve la conexión?, ¿reemplaza o complementa el `CardPoolEntry` de ADR 0006?
   Pendiente: decidir alcance y diseño antes de tocar código.
2. **Modos de juego alternativos según la fuente del mazo**: cuando `deckSources` incluye
   `deckofcards` (baraja estándar de 52 + jokers), el motor de juego no debería ser el de
   "cuartetos"/Top Trumps que ya existe en `packages/engine` (asume atributos numéricos
   comparables tipo Pokémon/TCG) - debería ser lógica real de juegos de baraja: póker
   (jugadas: pareja, dos pares, trío, escalera, color, full, póker, escalera de color...),
   Blackjack/21, "51" (rummy), Baccarat, etc. Implica: (a) investigar y documentar las reglas
   exactas de cada modalidad a soportar, (b) decidir cuáles priorizar primero, (c) diseñar
   cómo `MatchConfig`/el motor eligen entre "modo cuartetos" y "modo baraja X" según
   `deckSources`, ya que `packages/engine` hoy asume un único tipo de partida. Es
   efectivamente un motor de juego nuevo por modalidad, no un ajuste del existente. Pendiente:
   el dueño del proyecto debe decidir qué modalidades priorizar antes de diseñar o
   implementar esto.
3. **Recuperación de contraseña** (cuentas registradas, `POST /auth/register`/`POST
/auth/login`): NO implementar todavía - pedido explícito del dueño del proyecto ("no quiero
   recopilar email todavía... si quieres omite ese paso aún y luego definimos qué plataformas
   de auth usaremos"). Requiere primero decidir un canal/plataforma de auth (email
   transaccional u otro) que hoy no existe en el proyecto - sin eso no hay forma de entregar un
   link/código de recuperación a nadie. Un usuario que pierde su contraseña hoy simplemente no
   puede recuperar esa cuenta (sí puede seguir jugando como guest, o registrar una cuenta
   nueva). Pendiente: el dueño del proyecto define la plataforma de auth antes de que esto se
   diseñe o implemente.

### Alcance confirmado por el dueño del proyecto (2026-09-22, misma sesión)

Ninguna de las dos se diseñó ni se codificó todavía - esto es solo la respuesta de alcance
para cuando se retomen:

- **Modos de juego alternativos (punto 2)**: las 4 modalidades a construir son **Póker
  (Texas Hold'em)**, **Blackjack/21**, **51/Rummy** y **Baccarat** - las cuatro confirmadas,
  sin orden de prioridad explícito todavía (preguntar al iniciar el diseño si hace falta
  secuenciarlas o si se diseñan juntas).
- **Persistencia offline SQLite (punto 1)**: el dueño del proyecto la quiere **pronto, en
  paralelo a la Fase 3** (`packages/providers`) - explícitamente NO diferida
  indefinidamente. Cuando se planifique Fase 3, este tema debe traerse a la mesa junto con
  los providers, no asumirse como pendiente sin fecha.

## Session 2026-09-22 (cont'd) — hosting requires a registered account

**Not committed yet, sitting in the working tree.** Scope change from the project owner,
mid-session, on top of the accounts work above: a pure guest (never called
`POST /auth/register`) can join any match but can no longer create one - otherwise a lobby's
lifetime is capped at the host's 12h guest JWT with no way to recover it.

- `packages/contracts/src/errors.ts`: new `ERR_GUEST_CANNOT_HOST` code (es/en message), mapped
  to `403 Forbidden` in `apps/api/src/common/kardux-exception.filter.ts` (permission issue on
  an authenticated caller, not a malformed request - deliberately not `ERR_VALIDATION`/400).
- `apps/api/src/match/match.service.ts`: `createMatch()` now looks up the full `User` row for
  `hostId` (the JWT payload alone doesn't carry `username`) and throws
  `ERR_GUEST_CANNOT_HOST` before touching `parseConfig`/persisting anything if `username` is
  `null`. `GET /matches/public|mine|:code` unchanged - any valid bearer token still works
  there, only hosting is restricted.
- `apps/api/src/match/match.controller.ts`: `POST /matches`'s `@ApiOperation` documents the
  new requirement and the `403`.
- `apps/api/src/match/match.service.spec.ts`: existing `createMatch` tests updated to mock a
  registered host by default (`user.findUnique` returns one with `username` set); added a new
  case asserting a `null`-username caller gets `ERR_GUEST_CANNOT_HOST` and `match.create` is
  never called.
- **Also fixed while touching this**: `apps/api/src/deck/deck.controller.spec.ts` was still
  asserting the OLD hardcoded 10-source catalog (pre-dates this session's `tcg-github-sync`
  rewrite) and additionally broke outright once `DeckModule` started importing `AuthModule`
  earlier this session (`Test.createTestingModule` pulled in the whole `AuthModule` graph -
  `JwtModule.registerAsync` needing `ConfigService`, `AuthService` needing `PrismaService` -
  none of which a `ConfigModule`-less unit test provides). Rewritten to build the testing
  module from `DeckController`/`DeckService` directly (skipping `AuthModule` entirely) with
  `JwtAuthGuard` and `GithubSyncClient` both overridden/mocked, and assertions rewritten
  against the real manifest-driven shape (`cardCount`/`preview`, only the sources actually
  synced).
- **Verified for real**: full suite `pnpm --filter @kardux/api test` - 27 passed, only the 2
  pre-existing `game.gateway.spec.ts` failures remain (the `autoStartPlayers`/`maxPlayers`
  mismatch from the "match:mine + join-approval flow: INCOMPLETE" session above - untouched,
  out of scope here). `typecheck`/`lint`/`build` all clean (0 errors). Ran the API for real: a
  fresh guest's `POST /matches` → `403 ERR_GUEST_CANNOT_HOST`; a `POST /auth/register`-issued
  token (a real registered account, see the entry below for how registration actually works)
  → `201`, room created normally. Stopped the process afterward.

## Session 2026-09-22 (cont'd) — final auth design: guest and registered accounts never merge

**Not committed yet, sitting in the working tree.** Went through two intermediate designs
earlier in this same session (a "register claims the caller's guest identity" model) before
the project owner rejected that mental model outright: **guest and a registered account are
two completely separate identities that never merge, full stop.** This entry describes only
the final shape - the intermediate versions are gone from the code, not just superseded.

- **Guest (`POST /auth/guest`)**: fully anonymous. The client sends only `tabId`;
  `nickname`/`avatarSeed` are generated server-side (`AuthService.createGuest` -
  `"Jugador" + random 4 digits` / `crypto.randomUUID()`). No password, no way to "claim" or
  upgrade this identity into anything else. Can join matches; cannot host one
  (`ERR_GUEST_CANNOT_HOST`, see the entry above - unaffected by this change).
- **Register (`POST /auth/register`)**: public, no bearer token involved anywhere in this
  flow. Always creates a brand-new `User` from scratch with its own `username`/`passwordHash`
    - `nickname`/avatar default to `username`. Returns the same `{token, user}` shape as
      `guest`/`login`. Fails with `ERR_VALIDATION` if `username` is taken - the error's new
      `data.suggestions` field (see below) carries 2-3 available alternatives
      (`AuthService.generateUsernameSuggestions`: same username truncated + random 4-digit
      suffix, checked against the DB in one query).
- **`GET /auth/check-username?username=`** (new, public): `{available, suggestions}` - same
  suggestion logic as above, for a signup form to validate live before submitting.
- **`packages/contracts/src/errors.ts`**: `errorPayloadSchema` gained a generic, optional
  `data: Record<string, unknown>` field (not `suggestions`-specific - any future error can
  attach structured context the same way). `KarduxError` takes an optional third `data`
  constructor arg; `KarduxExceptionFilter` (REST) and `GameGateway.toErrorPayload` (sockets)
  both include it in the response when present.
- `apps/api/src/auth/optional-jwt-auth.guard.ts` (from the rejected intermediate design)
  **deleted entirely** - dead code once `POST /auth/register` went back to being unguarded.
- **Login (`POST /auth/login`)**: unchanged - `{username, password, tabId}`, verifies
  `bcrypt.compare`, mints a fresh JWT for the same `User.id`.
- **Password recovery**: explicitly deferred, not implemented - see "Decisiones de
  arquitectura grandes pendientes de aprobación" below.
- **Verified for real**: full suite 27/29 (same 2 pre-existing `game.gateway.spec.ts`
  failures, untouched, unrelated to auth), `typecheck`/`lint`/`build` clean. Ran the API for
  real: `POST /auth/guest` with only `tabId` → `201`, random `nickname`/`avatarSeed`; `POST
/auth/register` with an already-taken username → `ERR_VALIDATION` with real, DB-checked
  `data.suggestions`; `GET /auth/check-username` confirmed both a free and a taken username;
  `POST /auth/register` with a brand-new username and NO Authorization header → `201`, usable
  token; that token immediately created a match → `201`; `POST /auth/login` with those same
  credentials → identical `user.id` to the direct-register response; a fresh, never-registered
  guest's `POST /matches` → `403 ERR_GUEST_CANNOT_HOST` (still enforced, unaffected). Stopped
  the process afterward.

## Session 2026-09-22 (cont'd) — auth/deck-catalog live verification

Confirmed for real (previous entries in this file already described what shipped; this is
the live proof, run against the local Postgres with Redis stopped - nothing in this API
version reads Redis yet, so that didn't block anything):

- `GET /decks/sources` without a token → `401`. With a token → `200`, exactly 3 sources
  (`deckofcards` cardCount 54, `pokeapi` cardCount 1351, `apitcg` cardCount 4466), each with a
  real preview card (name + working image URL) pulled live from `tcg-github-sync`. No
  `local`/`dragonball`/etc. placeholder rows.
- `GET /leaderboard`, `GET /matches/public`, `GET /matches/:code` without a token → `401` on
  all three.
- Redis was not running locally during this check - noted for awareness, didn't affect any of
  the above since nothing on these paths depends on it yet.

## Session 2026-09-22 (cont'd) — Phase 2b, part 2: the real game loop ships

The item every prior recap in this file listed as "not started" - a match is now actually
playable, not just joinable. **Committed to a feature branch, PR opened against `main`, not
merged yet** (branch `feat/real-game-loop`).

- **`MatchRuntimeService`** (`apps/api/src/game/match-runtime.service.ts`, new): owns every
  match's live `@kardux/engine` `MatchState` in memory - the only thing that calls `reduce()`.
  Per-match locking is an in-process async mutex (the real correctness guarantee for this
  single-instance deployment) plus a best-effort Redis lock on top that degrades gracefully
  when Redis is unreachable (confirmed live - no local Redis running, logged a warning, game
  worked normally). Schedules one precise `setTimeout` at whichever deadline
  (countdown/turn/match duration) is soonest instead of polling. Persists
  `Round`/`DeckSnapshot`/`MatchEvent`/final `Match`+`MatchPlayer` rows **before** broadcasting -
  a client reacting to a broadcast must never observe state the database doesn't have yet (a
  real race the first version of this had, caught by the matchDurationMs integration test).
- **`DeckBuilder`** (`apps/api/src/deck/deck-builder.service.ts`, new): builds a real, playable
  `Card[]` for a `MatchConfig`. `local` is a small, deterministic, fully offline synthetic deck
  (inline SVG card backs, no network at all) - covers the config's own default
  (`deckSources: ['local']`), so a fresh clone with zero connectivity can still create and play
  a match. `pokeapi`/`deckofcards`/`apitcg` sample real entities from `GithubSyncClient`,
  normalized to numeric stats (never `NaN` - an entity with an unparseable stat is discarded,
  never padded). Attribute selection is the intersection of every requested source's available
  numeric stats, capped by `attributeCount` - a combination that can't supply enough (e.g.
  `apitcg`'s HP-only data against the default `attributeCount` 4, or `deckofcards`' 3 derived
  stats against anything above 3) fails fast with an actionable `ERR_INVALID_CONFIG` instead of
  fabricating a stat that doesn't mean anything.
- **`GameGateway`**: wired the rest of CLAUDE.md's socket contract table -
  `match:config`/`match:start`/`match:leave`/`match:rejoin`/`round:selectAttribute`/
  `round:playCard`/`chat:send` (rate-limited + sanitized)/`ping:latency`, plus one **additive**
  event not in the original table, `match:cancelCountdown` (the engine already implements
  cancelling an autostart countdown per CLAUDE.md rule 3 - "cancelable solo por el anfitrión" -
  nothing exposed it over the wire before). The existing `match:join`/`requestJoin`/
  `respondJoin` handlers now also dispatch a real `player.join` engine action (they previously
  only touched Postgres and hand-built the `match:playerJoined` broadcast themselves) and
  auto-start the countdown once `autoStartPlayers` is reached.
- `@kardux/engine`'s public entrypoint now also exports `reduce()`/`ReduceResult` and the `rng`
  module (`createRngState`/`shuffle`/etc.) - both were only reachable via a relative import
  from `apps/api` before.
- Also fixed while touching this: the two pre-existing `game.gateway.spec.ts` failures
  (`autoStartPlayers` defaulting to 7 and failing validation against a test's smaller
  `maxPlayers`) every prior recap in this file flagged as "assume the test suite does not pass
  yet" - the test helper now pins `autoStartPlayers` to the test's own `maxPlayers`.

**Verified for real** (not just green tests): full match played to completion and a
`matchDurationMs` timeout both proven end-to-end via real sockets against local Postgres
(`apps/api/src/game/match-runtime.integration.spec.ts`), **plus** a live run of the actual
built server (`node dist/main.js`) driven by a throwaway `socket.io-client` script covering the
whole path - register two real accounts, create a match over REST, join both over sockets,
autostart, select an attribute, play a card, resolve the round, finish the match - with the
resulting `Match`/`Round`/`DeckSnapshot`/`MatchPlayer` rows confirmed directly in Postgres
afterward (`status: FINISHED`, real `winnerId`, `finalCards`/`placement` set correctly). Full
suite `pnpm --filter @kardux/api typecheck/lint/test/build` all green (39/39 tests). Stopped
the process afterward.

### How to try a real match yourself

```bash
pnpm --filter @kardux/api dev          # terminal 1
# terminal 2, using the Postman collection (apps/api/postman/) or curl:
# 1. POST /auth/register twice (two different usernames) -> two {token, user}
# 2. POST /matches with the first token, deckSources: ["local"] (works with zero connectivity),
#    minPlayers/maxPlayers/autoStartPlayers small (e.g. 2) to start quickly
# 3. Open two browser tabs / socket.io-client connections, auth: { token, tabId } per CLAUDE.md,
#    both emit match:join { code, nickname, avatarSeed } - the match autostarts once
#    autoStartPlayers is reached
# 4. Listen for round:started, whoever is turnOrder[currentTurnIndex] emits
#    round:selectAttribute { attribute }, then everyone emits round:playCard
```

### Known limitations, not addressed in this session (deliberately out of scope)

- **`MatchState` only lives in this process's memory.** A restart mid-match loses that match's
  _live_ state (its durable outcomes - rounds played, final standings if it already finished -
  survive in Postgres regardless). A real multi-instance deployment would need to persist and
  rehydrate `MatchState` itself, not just its outcomes. `ensureSession` fails loudly
  (`ERR_VALIDATION`) for an `IN_PROGRESS` match with no in-memory session rather than silently
  re-dealing a new hand under the old match id.
- **Same user, two live tabs, one match**: would count as two engine players/seats
  (`playerKey = userId:tabId`) even though `MatchPlayer` only allows one DB row per
  `(matchId, userId)` - a pre-existing tension in the `playerKey` design from before this
  session, not something this change introduces or resolves. Worth a real design decision
  before it bites someone testing with the same registered account in two tabs.
- **Multi-tab manual testing** (CLAUDE.md's "7 pestañas del mismo navegador = 7 jugadores"):
  not exercised as actual browser tabs in this session - the integration tests and the live
  smoke test both simulate multiple players via separate `socket.io-client` connections
  (equivalent from the server's point of view, since identity is per-socket via the handshake,
  never per-cookie/localStorage), but nobody has yet opened real Chrome tabs side by side.
- **Frontend**: a separate, parallel effort this session (own branch/PR) rebuilds `apps/web` to
  actually render this game loop (currently only lobby/auth screens exist, no match-room UI
  wired to `round:*` events yet). Integrating the two is the very next step once both PRs land.
- Motores de póker/blackjack/51/baccarat y persistencia offline SQLite: siguen exactamente
  donde estaban (ver arriba) - no tocados en esta sesión.
## Session 2026-09-22 (cont'd) — frontend total redesign (apple-design, real branding)

Parallel fork, worktree-isolated, scope limited to `apps/web` (+ copying `favicon/`/`logo.png`
into `apps/web/public`) - a second fork worked the backend game-loop/deck-building in its own
worktree at the same time; this entry only covers the frontend side. **Not committed to
`main` yet** - branch `frontend/apple-design-redesign` (see below), opened as its own PR.

- **Real palette from `logo.png`**, replacing the flat placeholder navy+gold the project owner
  said looked "tosco": deeper obsidian (`#05070F`), warmer gold/bronze (`#D9AC53`/`#F4CF7E`),
  and jewel-tone accents lifted from the logo's fanned cards (ember, ice, teal, amethyst,
  steel) used per deck-source/state. `CLAUDE.md`'s "Identidad visual" section rewritten to
  match - see its own "revisión 2026-09-22" note.
- **`framer-motion` added** (`apps/web/package.json`) - this project's own CLAUDE.md already
  named it as the intended animation library, it just was never installed. Used for: page
  transitions (`components/PageTransition.tsx`, wraps every route inside one
  `AnimatePresence` at the `App.tsx` level), the flip/stat-select card component
  (`components/PlayingCard.tsx`), the deck-source carousel, the radial table, and the victory
  overlay.
- **`components/PlayingCard.tsx`**: one card component (front/back flip, `layoutId`-capable so
  a card can visually travel between contexts) shared by the hand, the pot, rival seats, and
  the deck-source carousel - matches CLAUDE.md's animation table's "layoutId compartido" note
  for the mano→pozo flight, once the engine actually emits round events.
- **`components/DeckSourceCarousel.tsx`**: replaces `CreateMatchPage`'s old checkbox list with
  real synced cards (`DeckSourceDescriptor.preview[0]`, live from `tcg-github-sync`) in a
  native-scroll-snap carousel - deck sources are picked by tapping an actual card, not reading
  a name next to a checkbox.
- **`components/RadialTable.tsx`**: CLAUDE.md's "mesa radial" - rivals fanned along an
  elliptical arc (trig-computed per seat, not a fixed grid), pot in the center with a
  "POZO ×N" badge, local player anchored bottom-center with an enlarged, stat-clickable card.
  Collapses to a scrollable column below 768px per CLAUDE.md's mobile spec.
- **`components/MatchClock.tsx`**: live HUD countdown from `RedactedMatchState.endsAt` /
  `config.matchDurationMs` - renders "∞ sin límite" when `matchDurationMs` is 0, the static
  configured duration before the match starts, and a live ticking countdown (turns red/pulses
  under 60s) once `startedAt` is set. This is what makes the match duration actually visible
  and testable, not just configurable in a form.
- **`components/VictoryOverlay.tsx`**: `match:finished` - lightweight CSS/framer-motion
  confetti burst (no new dependency), shield emblem, cascading final standings.
- **`MatchRoomPage.tsx` rewritten**: kept 100% of the existing join/pending-request/host-accept
  socket logic unchanged, and _added_ real listeners for every round-lifecycle server event
  (`round:started/attributeSelected/cardPlayed/revealed/resolved`, `match:countdown/started`,
  `match:finished`, `pong:latency`) plus a 5s latency ping - all wired against the real
  `@kardux/contracts` event types, so this lights up for real the moment the backend fork's
  `MatchRuntimeService` starts emitting these (nothing here is mocked data).
- **`CreateMatchPage.tsx`**: gained match-duration presets (30 min/1h/2h/sin límite) - the
  original form never exposed `matchDurationMs` at all; also clamps `autoStartPlayers` to
  `[minPlayers, maxPlayers]` client-side, the same invariant that broke
  `game.gateway.spec.ts`'s tests server-side.
- **Logo/favicon wired**: `apps/web/index.html` gained the exact tag set the project owner
  provided (icons, apple-touch-icon, manifest, Google Fonts preconnect for Cinzel/Inter);
  `favicon/site.webmanifest`'s `theme_color`/`background_color`/`description` updated off the
  generic Vite defaults to match the real brand.
- **Fixed a real, pre-existing lint gap while here**: `apps/web`'s code already had
  `// eslint-disable-next-line react-hooks/exhaustive-deps` comments, but
  `eslint-plugin-react-hooks` was never installed or configured anywhere in the repo - the
  disable comment itself failed lint ("Definition for rule ... was not found"). Added the
  plugin (root `package.json` devDependency) and a scoped rule block in the root
  `eslint.config.js` (`files: ['apps/web/**/*.{ts,tsx}']`, so `apps/api`'s NestJS code is
  unaffected) instead of just deleting the now-broken comments.
- **Verified for real**: `pnpm --filter @kardux/contracts build`, then
  `pnpm --filter @kardux/web typecheck|lint|build` all clean (0 errors), `pnpm --filter
@kardux/web dev` started cleanly and served `/`, `/logo.png`, `/favicon.svg` with `200`.
  Could not test the live radial-table animations end-to-end in this worktree - the backend
  game loop (`MatchRuntimeService`) doesn't exist here yet (separate fork's job); that
  integration check happens once both forks land on the same branch.
- **Note for whoever integrates this with the backend fork's contracts changes**: this
  worktree's `packages/contracts/src/{auth,card,deck-source,errors,match,socket-events}.ts`
  were manually synced from the main checkout's _uncommitted_ working tree (untracked files
  don't come along with a fresh git worktree) so `apps/web` would even compile against the
  real, current contract shapes (`guestAuthRequestSchema` sending only `tabId`, `RegisterRequest`/
  `LoginRequest`/`CheckUsernameResponse`, the `match:requestJoin`/`respondJoin` events,
  `DeckSourceDescriptor.cardCount`/`preview`). If the backend fork's own contracts diff differs
  from this snapshot, reconcile before merging both branches - don't assume either side's copy
  is automatically the newer one.

## Workflow for this project, going forward

One branch per unit of work → professional Conventional Commit(s) in English → push → PR →
merge to `main` → this file updated with what shipped and what's next. Phase 0's five scaffold
commits went straight to `main` (mirroring the user's own initial `git init`/`git push`
sequence for the empty repo); everything after this recap follows the branch → PR → merge
cycle instead.
