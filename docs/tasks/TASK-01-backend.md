# Fase 1 y 2 — Dominio + API

> Requiere haber leído `CLAUDE.md`.

Usando el contexto del proyecto Kardux Battle, ejecuta SOLO la Fase 1 y 2 (dominio + API).
No escribas nada de frontend todavía.

Entrega:

1. Monorepo pnpm + Turborepo con `packages/contracts`, `packages/engine`, `apps/api`.

2. `@kardux/contracts`:
    - Tipos `Card`, `Player`, `MatchConfig`, `MatchState`, `RedactedMatchState`, `RoundResult`.
    - Enum de eventos socket (cliente→servidor y servidor→cliente) con esquemas Zod
      y un mapa tipado `ClientEvents` / `ServerEvents` para `Socket<ClientEvents, ServerEvents>`.
    - Códigos de error tipados (`ERR_NOT_YOUR_TURN`, `ERR_MATCH_FULL`, `ERR_INVALID_CONFIG`…).

3. `@kardux/engine` (TypeScript puro, cero dependencias de I/O):
    - `createMatch(config, seed)`, `reduce(state, action, ctx)` donde `ctx = { now, rng }`.
    - RNG **seeded** (mulberry32 o sfc32) + `shuffle` Fisher-Yates determinista.
    - Reparto equitativo con descarte previo de sobrantes.
    - Resolución del primer turno buscando 1A, 1B… en orden.
    - Comparación de atributo, ganador, pozo acumulado por empate, cobro al fondo de la pila.
    - Eliminación, timeout de turno con las 3 políticas, fin por tiempo, fin por mazo completo.
    - `redactFor(playerId, state)` que devuelve solo lo que ese jugador puede ver.
    - Tests Vitest exhaustivos, incluyendo: empate triple encadenado, jugador eliminado en
      mitad de ronda, mazo no divisible entre jugadores, partida terminada por reloj con empate
      de cartas, y una partida completa reproducible con semilla fija.

4. `apps/api` (NestJS):
    - Módulos: `MatchModule`, `GameGateway`, `DeckModule`, `LeaderboardModule`, `AuthModule`.
    - Auth: JWT de invitado (nickname + tabId) emitido por `POST /auth/guest`, TTL 12 h.
    - REST: `POST /matches`, `GET /matches/:code`, `GET /matches/public`, `GET /leaderboard`,
      `GET /decks/sources`, `GET /health`.
    - `GameGateway` sobre Socket.IO namespace `/game`: handshake valida JWT + tabId,
      `playerKey = userId:tabId`, rooms por `matchId`, broadcast de estado **redactado por socket**.
    - `MatchRuntimeService`: mantiene las partidas vivas en memoria + Redis, con un
      **lock por sala** (Redlock o `SET NX`) para serializar acciones concurrentes, timers de
      turno y de partida con `setTimeout` registrados en un `SchedulerRegistry`, y
      persistencia de rondas en Postgres de forma asíncrona (no bloquear el loop de juego).
    - Reconexión: gracia de 45 s, `match:rejoin` restaura el socket al room y reenvía snapshot.
    - Prisma con el esquema descrito, migración inicial y seed.
    - Redis para caché de mazos, pub/sub y adapter de Socket.IO.
    - Validación global con Zod pipe, filtro de excepciones que mapea a los códigos tipados,
      logs Pino con `matchId`, Helmet, CORS, rate limit.
    - `docker-compose.yml` con postgres + redis + api y `.env.example` comentado.
    - Tests de integración con `socket.io-client`: dos clientes juegan una ronda completa;
      un tercero intenta jugar fuera de turno y recibe `ERR_NOT_YOUR_TURN`.

5. Al terminar: árbol de archivos, comandos para levantar (`docker compose up -d && pnpm dev`),
   y un script `pnpm sim:match` que simula 7 jugadores por socket contra la API real para
   validar el flujo completo sin frontend.
