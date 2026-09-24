# API Testing — curl reference (local only, not committed)

Base URL for everything below: `http://localhost:3000` (run `pnpm --filter @kardux/api dev`
first, and make sure port 3000 is free).

Every request/response body here matches exactly what `/api/docs` (Swagger UI) documents —
if you'd rather click "Try it out" there instead of curl/Postman, that works too.

## Import into Postman

`apps/api/postman/` has a ready-to-use, local Postman collection covering every endpoint
below (including the error-case requests). No account or cloud sync needed — just import
both files:

1. Postman → **Import** → select both `apps/api/postman/kardux-api.postman_collection.json`
   and `apps/api/postman/kardux-local.postman_environment.json`.
2. Top-right environment dropdown → select **"Kardux Battle - Local"**.
3. Run **"1. Auth / Create a guest identity"** first — its test script automatically saves
   the returned `token` into the collection's `token` variable, so every other authenticated
   request in the collection (e.g. "Create a match") just works without copy/pasting anything.

To import into another client (Insomnia, Thunder Client, etc.) instead: most of them have a
"paste curl" / "import from curl" option — just paste any command below directly.

---

## 1. Create a guest identity — `POST /auth/guest`

No auth required. Do this first — you need the `token` from the response for step 3.

```bash
curl -X POST http://localhost:3000/auth/guest \
  -H "Content-Type: application/json" \
  -d '{
    "nickname": "RafArenas",
    "avatarSeed": "RafArenas",
    "tabId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  }'
```

**Response 201:**

```json
{
    "token": "eyJhbGciOi...",
    "user": {
        "id": "clx...",
        "nickname": "RafArenas",
        "avatarSeed": "RafArenas",
        "avatarUrl": "https://api.dicebear.com/9.x/adventurer/svg?seed=RafArenas"
    }
}
```

Notes:

- `tabId` must be a UUID (any valid one works for manual testing — generate more with
  `node -e "console.log(crypto.randomUUID())"` if you want several fake players).
- Open `avatarUrl` directly in a browser tab — it's a live SVG image, no extra request needed.
- Copy the `token` value (without quotes) — you'll paste it as a Bearer token below.

---

## 2. List deck sources — `GET /decks/sources`

No auth required.

```bash
curl http://localhost:3000/decks/sources
```

**Response 200:** array of 10 sources. Only `"local"` has `"ready": true` today — the rest
are catalog metadata (Phase 3, not built yet). `"marvel"` is the only one with
`"requiresApiKey": true`.

---

## 3. Create a match — `POST /matches`

**Requires auth.** Replace `TOKEN_AQUI` with the `token` from step 1.

```bash
curl -X POST http://localhost:3000/matches \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -d '{
    "visibility": "public"
  }'
```

Every field is optional — send `{}` to get all defaults (2-12 players, 4 packs × 8 cards,
etc. — see `MatchConfig` in `docs/SPEC.md` for the full list). Some other bodies to try:

```bash
# Fully custom config
curl -X POST http://localhost:3000/matches \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -d '{
    "minPlayers": 2,
    "maxPlayers": 4,
    "autoStartPlayers": 4,
    "matchDurationMs": 600000,
    "visibility": "private"
  }'

# Without a token at all - should fail with 401 ERR_UNAUTHORIZED
curl -X POST http://localhost:3000/matches \
  -H "Content-Type: application/json" \
  -d '{}'

# Impossible config - should fail with 400 ERR_INVALID_CONFIG
curl -X POST http://localhost:3000/matches \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -d '{"minPlayers": 10, "maxPlayers": 2}'
```

**Response 201/200:**

```json
{
    "matchId": "clx...",
    "code": "A3F9C1",
    "status": "LOBBY",
    "config": { "...": "full MatchConfig with defaults filled in" },
    "hostId": "clx...",
    "hostNickname": "RafArenas",
    "hostAvatarUrl": "https://api.dicebear.com/9.x/adventurer/svg?seed=RafArenas",
    "createdAt": "2026-09-21T..."
}
```

Copy the `code` — you'll use it in step 5.

---

## 4. List public matches — `GET /matches/public`

No auth required. Shows open (`visibility: "public"`) lobbies, newest first.

```bash
curl http://localhost:3000/matches/public
```

---

## 5. Get a match by code — `GET /matches/:code`

No auth required. Replace `A3F9C1` with the `code` from step 3.

```bash
curl http://localhost:3000/matches/A3F9C1
```

```bash
# Nonexistent code - should fail with 404 ERR_MATCH_NOT_FOUND
curl http://localhost:3000/matches/ZZZZZZ
```

---

## 6. Global leaderboard — `GET /leaderboard`

Requires a bearer token. Lists the registered accounts that finished at least one ranked
match, ordered by points (multiplayer Elo). There is no seed data: the table fills up as real
matches between registered accounts finish.

```bash
curl http://localhost:3000/leaderboard
```

```bash
# Custom page size
curl "http://localhost:3000/leaderboard?limit=2"

# Next page - replace CURSOR_AQUI with the "nextCursor" value from the previous response
# (only if it wasn't null)
curl "http://localhost:3000/leaderboard?limit=2&cursor=CURSOR_AQUI"
```

**Response 200:**

```json
{
    "entries": [
        {
            "userId": "...",
            "nickname": "...",
            "avatarUrl": "...",
            "elo": 1200,
            "gamesPlayed": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "streak": 0,
            "roundsWon": 0,
            "cardsWonTotal": 0,
            "favoriteAttribute": null
        }
    ],
    "nextCursor": null
}
```

---

## What's NOT here yet

Live gameplay (dealing cards, playing rounds, winning) is Socket.IO (`/game` namespace,
`MatchRuntimeService` + `GameGateway`) — not built yet, so a match created above stays in
`LOBBY` forever with no players joining it for real. This file only covers the REST surface
that exists today.
