# Kardux Battle

A real-time, multiplayer Top Trumps–style card battle game — build your deck from public
APIs (Pokémon, Dragon Ball, Naruto, and more), compare attributes, and battle across web,
desktop, and mobile.

> This file is the single entry point for the project — setup, architecture, diagrams, and
> current status all live here, updated as each phase lands, instead of being deferred to a
> "final docs" phase. `docs/adr/` holds the reasoning behind each decision and `docs/tasks/`
> the phase-by-phase build plan, for anyone who wants to go deeper than this file — but
> everything you need to understand and run the project day to day is on this page.

## Status

**Early development.** Phase 0 (monorepo scaffold), `@kardux/contracts`, and `@kardux/engine`
(68 passing tests, ≥90% coverage) are done and merged. `apps/api` boots for real
(`pnpm --filter @kardux/api dev`) with logging, Swagger, rate limiting, and a health check -
but nothing game-related yet: no auth, no Postgres/Redis, no gateway. See
[`docs/PENDING-WORK.md`](docs/PENDING-WORK.md) for the live session-by-session log of what
shipped and what's next.

## The game

A quartet-comparison game in the "Top Trumps" family, played with `N` packs × `M` cards
(4×8 = 32 by default). Every card is coded `<number><letter>` (`1A`, `2A`, … `4H`); the cards
sharing a letter form a "quartet" from the same thematic family, and every card in the deck
shares the exact same set of numeric attributes (3 to 6 of them).

1. A host creates a match and gets a 6-character hex code; others join with it.
2. The host starts manually once `minPlayers` is met, or the match auto-starts (5s countdown,
   host-cancelable) once `autoStartPlayers` connect — both configurable per match, not fixed.
3. The deck is dealt evenly; any remainder is discarded at random before dealing. Each player
   sees only the top card of their own face-down pile.
4. Whoever holds `1A` goes first (searching `1A, 1B … 1M, 2A, 2B, …` if `1A` wasn't dealt to
   anyone); turn order after that follows join order.
5. The player in turn picks one attribute; everyone plays their top card face-down, then all
   flip at once. Highest value wins every card on the table.
6. A tie leaves the cards on the table as an accumulating pot; the same player leads the
   tie-breaking round, and whoever eventually wins claims the whole pot.
7. A player with no cards left is eliminated (becomes a spectator).
8. The match ends when one player holds every card, or when `matchDurationMs` elapses (most
   cards wins; a tied card count is a draw). Both are configurable, not fixed at 7 players or
   1 hour like the original brief.

Full canonical rules, including every configuration field and the socket event contract, live
in [`CLAUDE.md`](CLAUDE.md).

## Architecture

```mermaid
graph TD
    subgraph Clients
        WEB[apps/web<br/>React + Vite, PWA]
        DESKTOP[apps/desktop<br/>Tauri 2]
        MOBILE[apps/mobile<br/>Expo]
    end
    subgraph Server
        API[apps/api<br/>NestJS: REST + Socket.IO gateway]
        ENGINE[packages/engine<br/>pure rules engine]
        CONTRACTS[packages/contracts<br/>Zod types + socket contract]
        PROVIDERS[packages/providers<br/>deck adapters]
    end
    DB[(PostgreSQL)]
    CACHE[(Redis)]
    EXT[External card APIs<br/>PokéAPI, Dragon Ball API, ...]

    WEB -->|Socket.IO + REST| API
    DESKTOP -->|Socket.IO + REST| API
    MOBILE -->|Socket.IO + REST| API
    API --> ENGINE
    API --> PROVIDERS
    WEB -.->|imports for optimistic UI| ENGINE
    WEB -.-> CONTRACTS
    API -.-> CONTRACTS
    ENGINE -.-> CONTRACTS
    API --> DB
    API --> CACHE
    PROVIDERS -->|sync job, not per-match| EXT
    PROVIDERS --> DB
```

Non-negotiable principle: the server is authoritative. No client ever decides a round's
outcome or sees another player's cards — every socket receives a state redacted down to what
that specific player is allowed to see (`@kardux/engine`'s `redactFor`).

### Monorepo layout

```
kardux-battle/
├─ apps/
│  ├─ api/          NestJS: REST + Socket.IO gateway              (bootstrap only)
│  ├─ web/          React + Vite, PWA                              (not started)
│  ├─ desktop/      Tauri 2, wraps the web build                   (not started)
│  └─ mobile/       Expo / React Native                            (not started)
├─ packages/
│  ├─ contracts/    types + Zod schemas + socket event contract    (done)
│  ├─ engine/       pure, deterministic rules engine                (done)
│  ├─ providers/    deck adapters for each card API                 (not started)
│  └─ ui/           shared design tokens/components                 (not started)
├─ docker/          compose: postgres, redis, api, web              (not started)
├─ docs/
│  ├─ adr/          architecture decision records
│  ├─ tasks/        the phase-by-phase build plan this project follows
│  └─ PENDING-WORK.md   running session log
└─ CLAUDE.md        canonical game rules and full technical spec
```

### Match state machine

```mermaid
stateDiagram-v2
    [*] --> LOBBY
    LOBBY --> COUNTDOWN: autoStartPlayers reached
    COUNTDOWN --> LOBBY: host cancels
    COUNTDOWN --> AWAITING_ATTRIBUTE: countdown elapses (deals the deck)
    LOBBY --> AWAITING_ATTRIBUTE: host starts manually (deals the deck)
    AWAITING_ATTRIBUTE --> AWAITING_CARDS: leader picks an attribute
    AWAITING_CARDS --> AWAITING_ATTRIBUTE: clear winner (winner leads next round)
    AWAITING_CARDS --> AWAITING_ATTRIBUTE: tie (same leader, pot carries over)
    AWAITING_ATTRIBUTE --> FINISHED: only one active player remains
    AWAITING_CARDS --> FINISHED: matchDurationMs elapsed, or one player holds every card
    FINISHED --> [*]
```

`DEALING`, `REVEAL`, `RESOLVE`, and `TIE_POT` from `CLAUDE.md`'s state machine are real steps
the engine walks through and reports via its event stream (so the client can animate each one:
the deal, the flip, the comparison, the pot banner) but aren't states the server sits in
between player actions — there's no decision to make during them, so they resolve within the
same `reduce()` call as the action that triggered them. The diagram above shows the states
that actually persist and wait for the next action.

## Tech stack

| Layer                   | Choice                                                                                                                            | Why (ADR)                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Monorepo                | pnpm workspaces + Turborepo                                                                                                       | [ADR 0001](docs/adr/0001-monorepo-pnpm-turborepo.md)        |
| API                     | NestJS 11 + Socket.IO                                                                                                             | [ADR 0002](docs/adr/0002-nestjs-over-alternatives.md)       |
| Rules engine            | Pure TypeScript, zero I/O, seeded RNG                                                                                             | [ADR 0003](docs/adr/0003-pure-rules-engine.md)              |
| Database                | PostgreSQL + Prisma                                                                                                               | [ADR 0004](docs/adr/0004-postgres-redis-swappable-cache.md) |
| Cache / locks / pub-sub | Redis                                                                                                                             | [ADR 0004](docs/adr/0004-postgres-redis-swappable-cache.md) |
| API docs                | `@nestjs/swagger` + `nestjs-zod` (generated from the same Zod schemas used for validation — never duplicated)                     | [ADR 0005](docs/adr/0005-api-docs-and-http-client.md)       |
| Manual API testing      | [Bruno](https://www.usebruno.com/) (free, open source, collections as text files in the repo)                                     | [ADR 0005](docs/adr/0005-api-docs-and-http-client.md)       |
| Deck data reliability   | Local `CardPoolEntry` mirror per source, synced on a schedule; decks are built from our own database, not a live third-party call | [ADR 0006](docs/adr/0006-local-card-pool-mirror.md)         |
| Web                     | React 19 + Vite + Tailwind + Zustand + Framer Motion                                                                              | `CLAUDE.md`                                                 |
| Desktop                 | Tauri 2                                                                                                                           | `CLAUDE.md`                                                 |
| Mobile                  | Expo / React Native                                                                                                               | `CLAUDE.md`                                                 |
| Validation              | Zod everywhere, both ends of every socket/REST payload                                                                            | `CLAUDE.md`                                                 |
| Testing                 | Vitest, Supertest, `socket.io-client`, Playwright                                                                                 | `CLAUDE.md`                                                 |

## Getting started

### Prerequisites

- Node.js 24+ (`.nvmrc` pins the exact version this repo was built against)
- [pnpm](https://pnpm.io/) 10+ (`corepack enable` will pick up the version pinned in
  `package.json`'s `packageManager` field)
- PostgreSQL 14+ reachable locally (native install or Docker — see below)
- Redis 7+ reachable locally (native install or Docker)

Everything above is free and open source; no paid tier, license key, or account is required
for any of it.

### Clone and install

```bash
git clone https://github.com/FlakoArenas26/Kardux-Battle.git
cd Kardux-Battle
pnpm install
```

### Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and fill in real values — `DATABASE_URL` (or the individual `DB_*`
fields it's assembled from), `REDIS_URL`, and a `JWT_SECRET` (generate one with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). **Never commit
`.env`** — it's git-ignored on purpose; `.env.example` is the template that _does_ get
committed, with placeholder values only.

### Database and cache

Either run them via Docker:

```bash
docker compose up -d postgres redis
```

...or point `apps/api/.env` at native local installs of both (this is what this project's own
dev machine currently does — see [ADR 0004](docs/adr/0004-postgres-redis-swappable-cache.md)
for why). Either way, create the database once:

```bash
psql -U postgres -h localhost -c "CREATE DATABASE kardux_dev;"
```

### Run it

```bash
pnpm install                              # once, from the repo root
pnpm --filter @kardux/api dev             # starts the API on http://localhost:3000
```

That's the real command — the API boots, validates `.env` at startup (fails fast with a clear
message if something's missing), and serves:

- `GET /health` — liveness check.
- `GET /api/docs` — Swagger UI, generated from the same Zod schemas used for validation
  (ADR 0005), so it's never out of sync with what the API actually accepts.
- `GET /api/docs-json` — the raw OpenAPI document, importable by any HTTP client.

`apps/api/bruno/` has a matching [Bruno](https://www.usebruno.com/) collection (open the
folder in Bruno, pick the `local` environment) if you'd rather click through requests than
use Swagger's "Try it out."

Nothing here touches Postgres or Redis yet — `AuthModule`/`MatchModule`/`GameGateway` (the
pieces that actually need them) are the next phase. Until then:

```bash
pnpm --filter @kardux/contracts test      # 20 passing
pnpm --filter @kardux/engine test         # 68 passing
pnpm --filter @kardux/api test            # 1 passing (health check)
pnpm -r list --depth -1                   # sanity-check the workspace sees every package
```

## Testing

- `packages/engine`: Vitest, coverage thresholds enforced at 90% lines/functions/statements,
  85% branches (`packages/engine/vitest.config.ts`) — covering chained ties, mid-round
  elimination, all three turn-timeout policies, a non-divisible deck, a match ending by clock
  with a tied card count, and a full reproducible match given a fixed seed.
- `apps/api`: Supertest for REST (one passing test so far, the health check); once the gateway
  exists, `socket.io-client` for integration tests (including a client that tries to act out
  of turn and gets `ERR_NOT_YOUR_TURN`). Nest's DI needs a real `emitDecoratorMetadata`-aware
  transform for services with constructor-injected dependencies - not needed yet (nothing has
  one), noted in `apps/api/vitest.config.ts` for when it is.
- `apps/web` (once it exists): Vitest + Testing Library for components, Playwright with real
  multi-browser-context sessions for a full 7-player match end to end.
- Every package runs its own `pnpm --filter <name> test`; `pnpm test` at the root runs all of
  them via Turborepo.

## Documentation map

- [`CLAUDE.md`](CLAUDE.md) — the canonical, complete game/technical spec.
- [`docs/adr/`](docs/adr/) — why each non-obvious technical decision was made, and what the
  alternatives were.
- [`docs/tasks/`](docs/tasks/) — the phase-by-phase plan this project is built in order.
- [`docs/PENDING-WORK.md`](docs/PENDING-WORK.md) — running log of what shipped each session
  and what's next, so no session has to re-derive context from git history alone.

## License

MIT — see [`LICENSE`](./LICENSE). Fan project, not affiliated with any of the games/shows
whose public APIs feed its decks; attribution for each one lands in `CREDITS.md` once
`packages/providers` exists.
