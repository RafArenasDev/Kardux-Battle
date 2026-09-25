# Deploy (free tier: Render + Aiven)

Production is a single **Render free web service** that serves both the API and the built PWA
from the same origin (<https://kardux-battle.onrender.com>). PostgreSQL and Redis (Valkey) run on
**Aiven's free plans**. [`render.yaml`](../render.yaml) documents the whole setup as a Blueprint.

```
browser ──HTTPS / WebSocket──▶ Render web service (NestJS)
                                 ├─ /auth /matches /decks /leaderboard /health  (REST)
                                 ├─ /socket.io                                   (live game)
                                 ├─ /api/docs                                    (Swagger)
                                 └─ everything else → apps/web/dist (PWA, SPA fallback)
                               ├──▶ Aiven PostgreSQL  (accounts, ranking, matches, card pool)
                               └──▶ Aiven Valkey      (live match snapshots, locks)
```

## Render service settings

| Setting        | Value                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Root directory | _(empty: repository root)_                                                                                                                |
| Build command  | `pnpm install --frozen-lockfile --prod=false && pnpm build:render` (pnpm is preinstalled; `corepack enable` fails on the read-only image) |
| Start command  | `pnpm --filter @kardux/api start:prod` (runs `prisma migrate deploy`, then the server)                                                    |
| Health check   | `/health` (answers 200 only when the database responds)                                                                                   |
| Auto-deploy    | On commit to `main`                                                                                                                       |

Why these commands:

- `--prod=false`: `NODE_ENV=production` makes pnpm skip devDependencies, but the Nest CLI,
  TypeScript and Vite are needed to build.
- `build:render` runs `prisma generate` explicitly (pnpm 10 does not run dependency install
  scripts) and then `turbo run build` (shared packages, API and web).
- Free instances have no pre-deploy step, so migrations run in the start command. They are
  incremental and idempotent (`migrate deploy`).

## Environment variables

Secrets are set in the Render dashboard, never committed: `DATABASE_URL` (Aiven PostgreSQL service
URI, with `sslmode=require`), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`,
`REDIS_URL` (Aiven Valkey URI, `rediss://`) and `JWT_SECRET`. The rest is in `render.yaml`.
The service's own URL (`RENDER_EXTERNAL_URL`, set by Render) is always allowed by CORS.

## Staying awake

A free Render instance sleeps after 15 minutes without traffic and needs ~50 s to wake up. To
keep the game instantly playable for anyone who opens the link, something must call `/health`
at least every 10-14 minutes (each call also touches the database):

- **Public repository**: the included workflow [`keep-alive.yml`](../.github/workflows/keep-alive.yml)
  pings every 10 minutes for free.
- **Private repository**: the workflow skips itself (it would consume the monthly Actions quota).
  Create a free HTTP monitor instead - [UptimeRobot](https://uptimerobot.com) (5-minute interval)
  or [cron-job.org](https://cron-job.org) - pointing to
  `https://kardux-battle.onrender.com/health`.

One always-on free service uses ~744 of the 750 free instance hours per month.

## Keeping the database under 1 GB

`RetentionService` runs every hour (and 30 s after boot):

| What                                   | When it is removed                                        |
| -------------------------------------- | --------------------------------------------------------- |
| Match event log (`match_events`)       | After `RETENTION_EVENTS_DAYS` (2)                         |
| Finished matches (+ rounds, snapshots) | After `RETENTION_FINISHED_DAYS` (7)                       |
| Abandoned lobbies / matches            | After 1 day                                               |
| Guest identities that never played     | After 3 days                                              |
| **All** match history (size guard)     | Whenever the database reaches `RETENTION_MAX_DB_MB` (700) |

Accounts, the ranking (`leaderboard_stats`) and the Pokémon card pool (~1,000 small rows) are
never pruned; their footprint is a few megabytes.
