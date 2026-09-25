# Kardux Battle — Especificación del juego

> Documento de diseño: reglas, contratos y decisiones técnicas. El código cita sus secciones
> (por ejemplo "regla 5" o "CONTRATO DE EVENTOS SOCKET.IO"), así que se actualiza junto con él.
> Las decisiones de arquitectura con alternativas evaluadas están en `docs/adr/`.

## PRODUCTO

Nombre: **Kardux Battle**. Tagline: "Elige el atributo. Gánate la mesa."

Juego de cartas multijugador en tiempo real, de cuartetos y comparación de atributos (estilo
"Top Trumps"), con Pokémon reales. Nació como uno de mis primeros proyectos de programación y lo
retomé para construirlo como un producto completo: servidor autoritativo, motor de reglas puro,
cuentas, ranking, PWA y despliegue real.

Identidad visual: base obsidiana (`#05070F` fondo, `#0E1424` paneles, paneles traslúcidos con
`backdrop-filter`), acento oro/bronce del escudo (`#D9AC53`, `#F4CF7E`, `#8A6F3A`), esmeralda para
victoria (`#2DD4A7`) y carmesí para derrota (`#EF4A5A`). Tipografía display **Cinzel**, texto
**Inter**. Los tokens viven en `apps/web/src/styles/`.

## EL JUEGO (reglas canónicas)

1. **Mazo**: `N` paquetes × `M` cartas (por defecto 4 × 8 = 32). Cada carta se codifica
   `<número><letra>` (1A, 2A … 4H). Un cuarteto son las cartas que comparten letra y pertenecen a
   la misma familia (un tipo de Pokémon). Todas las cartas comparten **el mismo conjunto de
   atributos numéricos** (3 a 6).
2. **Sala**: quien crea la partida recibe un **código hexadecimal** de 6 caracteres (ej. `A3F9C1`)
   y un enlace para compartir. Los demás entran con ese código.
3. **Inicio**: el anfitrión puede iniciar cuando haya ≥ `minPlayers`. Al llegar a
   `autoStartPlayers` arranca una cuenta regresiva visible de 5 s, cancelable solo por el
   anfitrión.
4. **Reparto**: se baraja el mazo completo con RNG sembrado y se reparte por turnos. Las cartas que
   no alcanzan para una vuelta completa (o que exceden `cardsPerPlayer`, si está definido) quedan
   fuera de juego en el mazo de la mesa. Cada jugador recibe una **pila boca abajo** y solo ve su
   carta superior.
5. **Primer turno**: lo inicia quien tenga la carta `1A`; si no está en juego se busca en orden
   `1B … 1M, 2A, 2B …`. Después, el orden sigue el orden de ingreso a la sala. En la práctica
   contra la máquina siempre empieza la persona (`firstTurn: 'first_joined'`).
6. **Ronda**: el jugador en turno elige **cualquier atributo** de su carta. Todos bajan su carta
   superior boca abajo, se voltean todas a la vez y gana el valor **más alto**; el ganador se
   lleva todas las cartas de la mesa al fondo de su pila.
7. **Empate en el primer puesto**: las cartas quedan en el pozo y se juega otra ronda con el mismo
   líder; el ganador de esa ronda se lleva también el pozo.
8. **Siguiente ronda**: la inicia el ganador de la anterior.
9. **Eliminación**: quien se queda sin cartas sale del orden de turno y sigue como espectador.
10. **Fin**: cuando un jugador tiene todas las cartas, o al cumplirse `matchDurationMs`; en ese
    caso gana quien tenga más cartas y, si hay igualdad, es **empate**.
11. **Abandono**: salir es definitivo y cuenta como derrota. En un duelo el rival gana con todas
    las cartas; con tres o más jugadores las cartas de quien sale se reparten entre los demás y la
    partida continúa. Un socket caído conserva el asiento 45 s antes de contar como abandono.

## CONFIGURACIÓN DE PARTIDA (todo configurable desde el lobby)

Esquema Zod único en `packages/contracts/src/match-config.ts`, validado en cliente y servidor:

| Campo                                      | Por defecto     | Notas                                           |
| ------------------------------------------ | --------------- | ----------------------------------------------- |
| `minPlayers` / `maxPlayers`                | 2 / 7           | Rango 2-7 (`MAX_PLAYERS`)                       |
| `autoStartPlayers`, `autoStartCountdownMs` | 7, 5 000 ms     | Entre `minPlayers` y `maxPlayers`               |
| `matchDurationMs`                          | 1 h             | `0` = sin límite                                |
| `turnTimeoutMs`, `onTurnTimeout`           | 30 s, aleatorio | Al vencer se elige un atributo por el jugador   |
| `packs`, `cardsPerPack`, `attributeCount`  | 4, 8, 4         | Validados contra los límites reales del mazo    |
| `cardsPerPlayer`                           | 0               | `0` = repartir todo lo posible                  |
| `firstTurn`                                | `lowest_card`   | `first_joined` en la práctica contra la máquina |
| `deckSources`                              | `['pokeapi']`   | Preparado para sumar más fuentes                |
| `visibility`, `allowSpectators`            | privada, sí     |                                                 |

Se rechazan combinaciones imposibles (`autoStartPlayers > maxPlayers`, `minPlayers > maxPlayers`,
mazo insuficiente para los jugadores, etc.).

## FUENTES DE CARTAS

El juego usa un único mazo: Pokémon desde la API GraphQL de PokéAPI. Al arrancar, la API sincroniza
el catálogo completo a la tabla `card_pool_entries` (si está vacía o tiene más de una semana) y las
partidas se arman desde esa copia local, nunca llamando a la API externa en medio del juego
(ADR 0006).

Reglas para cualquier fuente:

- Todo se normaliza a números; una entidad sin datos o sin imagen se descarta.
- Todas las cartas de un mazo comparten exactamente las mismas claves de `stats`.
- Cada partida guarda un `DeckSnapshot`, así sigue siendo reproducible aunque la fuente cambie.
- Sumar una fuente = nuevo id en `DECK_SOURCE_IDS` + su sincronización al pool.

## ARQUITECTURA

Monorepo pnpm + Turborepo: `apps/api` (NestJS: REST + Socket.IO), `apps/web` (React + Vite, PWA),
`packages/contracts` (tipos y esquemas Zod), `packages/engine` (motor de reglas puro) y
`packages/content` (metadatos del mazo, avatares e íconos).

Principio no negociable: **servidor autoritativo**. El cliente nunca decide el resultado de una
ronda ni conoce cartas ajenas. El estado se envía **redactado por jugador**: cada socket recibe su
carta superior, el conteo de cartas de los demás y lo que hay en la mesa.

### MatchRuntimeService

Dueño de las partidas en vivo: estado en memoria con snapshot en Redis tras cada acción aceptada,
un lock por sala (mutex en proceso + `SET NX PX` en Redis) para serializar acciones concurrentes,
timers de turno y de partida, ritmo de la coreografía (`turnOpensAt`) y persistencia asíncrona de
rondas en PostgreSQL. Es el único que llama a `reduce()`.

## MÁQUINA DE ESTADOS

`LOBBY → COUNTDOWN → DEALING → AWAITING_ATTRIBUTE → AWAITING_CARDS → REVEAL → RESOLVE
→ (AWAITING_ATTRIBUTE | TIE_POT | FINISHED)`

- El motor expone `reduce(state, action, { now }): { state, events[] }` y es **determinista** dada
  una semilla: dentro del motor no existen `Math.random()` ni `Date.now()`, ambos se inyectan.
- Cada estado emitido lleva un `version` monotónico para detectar desincronización.

## CONTRATO DE EVENTOS SOCKET.IO (namespace `/game`)

Cliente → Servidor:

| Evento                  | Payload                          | Notas                                       |
| ----------------------- | -------------------------------- | ------------------------------------------- |
| `match:join`            | `{ code, nickname, avatarSeed }` | ingreso directo; error tipado si está llena |
| `match:quick`           | `{ vsBot? }`                     | partida rápida 1 vs 1 o contra la máquina   |
| `match:rejoin`          | `{ token }`                      | reconexión con gracia de 45 s               |
| `match:requestJoin`     | `{ matchId }`                    | solicitud desde el listado público          |
| `match:respondJoin`     | `{ requestId, accept }`          | solo anfitrión                              |
| `match:config`          | `Partial<MatchConfig>`           | solo anfitrión, solo en LOBBY               |
| `match:start`           | `{}`                             | solo anfitrión, ≥ minPlayers                |
| `match:cancelCountdown` | `{}`                             | solo anfitrión                              |
| `match:leave`           | `{}`                             | abandono definitivo (regla 11)              |
| `round:selectAttribute` | `{ attribute }`                  | solo el jugador en turno                    |
| `round:playCard`        | `{}`                             | baja la carta superior                      |
| `chat:send`             | `{ text }`                       | rate-limited, sanitizado                    |
| `ping:latency`          | `{ t }`                          | RTT para el HUD                             |

Servidor → Cliente: `match:state` (snapshot redactado) · `match:playerJoined` · `match:playerLeft`
· `match:joinRequested` / `joinRequestPending` / `joinApproved` / `joinRejected` ·
`match:countdown` · `match:started` · `round:started` · `round:attributeSelected` ·
`round:cardPlayed` · `round:revealed` · `round:resolved` · `round:tie` · `turn:timer` ·
`match:finished` · `match:closed` · `chat:message` · `pong:latency` · `error` (código + mensaje
i18n).

Todos los payloads se validan con Zod en ambos extremos y se exportan desde `@kardux/contracts`.

### Solicitudes de ingreso

El ingreso por código o enlace es directo (`APPROVED`). El ingreso desde el listado público crea
una fila `PENDING` que el anfitrión acepta o rechaza; un rechazo no borra la fila, queda como
`REJECTED` (útil para auditoría/historial).

## SESIONES MULTI-PESTAÑA

Siete pestañas del mismo navegador deben poder ser siete jugadores distintos.

- La sesión vive en `sessionStorage` (no cookies ni `localStorage` compartido): `tabId =
crypto.randomUUID()` y el JWT de esa pestaña.
- El handshake envía `auth: { token, tabId }` y el servidor usa `playerKey = userId:tabId`.
- "Mantener sesión iniciada" guarda aparte un token de recuerdo que cada pestaña nueva canjea
  por su propia sesión.
- Invitados: JWT de invitado (nickname + tabId) con nombre y avatar aleatorios; nunca son
  anfitriones de salas privadas.

## INTERFAZ Y MESA DE JUEGO

Mesa con el jugador local abajo, el arco de rivales arriba (avatar, nickname, contador de cartas,
indicador de turno) y en el centro la mesa de juego con el **mazo** (solo si sobran cartas) y el
**pozo** en posiciones fijas. En móvil la mesa ocupa exactamente una pantalla, sin scroll; el
tamaño de las cartas se calcula con el espacio real disponible.

Coreografía de una ronda (tiempos compartidos en `packages/contracts/src/table-timing.ts`):

| Momento   | Qué pasa                                                                   |
| --------- | -------------------------------------------------------------------------- |
| Reparto   | las cartas salen del mazo a cada pila y los contadores suben una a una     |
| Atributo  | se anuncia el atributo elegido                                             |
| Bajada    | cada carta vuela de su pila a la mesa, boca abajo, en orden de turno       |
| Volteo    | todas a la vez, con un escalonado corto                                    |
| Ganadora  | la carta ganadora se ilumina                                               |
| Resultado | "Te llevas X cartas" / "{nombre} se lleva X cartas", centrado en la mesa   |
| Cobro     | las cartas vuelan a la pila del ganador; recién ahí cambian los contadores |

El servidor no abre el siguiente turno hasta que termina la coreografía (`turnOpensAt`). Se respeta
`prefers-reduced-motion`.

## TABLA DE POSICIONES

- **En partida**: posiciones en vivo por cantidad de cartas; quien abandona queda último con cero.
- **Global**: Elo multijugador (K=32, 1200 inicial), cada jugador contra cada rival como
  mini-duelo; victorias, empates, derrotas, % de victorias, racha y atributo favorito. Solo cuentan
  partidas entre cuentas registradas; cada partida se califica una sola vez (`Match.ratedAt`).
- `GET /leaderboard` con paginación keyset (alcance global).

## BASE DE DATOS (PostgreSQL + Prisma)

`Player` · `Match` (code, config JSONB, status, seed, startedAt, endedAt, winnerId, ratedAt) ·
`MatchPlayer` (seat, joinOrder, status, finalCards, placement, eliminatedAt) · `Round` (index,
attribute, leaderId, winnerId, potSize, playedCards JSONB) · `DeckSnapshot` · `LeaderboardStat` ·
`MatchEvent` (log append-only) · `CardPoolEntry`.

El código de sala es único solo sobre partidas activas (la validación vive en el servicio, porque
Prisma no expresa índices únicos parciales). Migraciones versionadas e incrementales; sin datos
semilla, solo cuentas reales.

## CALIDAD Y OPERACIÓN

- TypeScript `strict`, ESLint + Prettier, Husky + lint-staged, Commitlint.
- Vitest para contracts y engine (cobertura ≥ 90 %), Supertest y socket.io-client para la API.
- Logs estructurados (Pino) con matchId en cada línea; `/health` con estado de base de datos y
  caché.
- Seguridad: Helmet con CSP, rate limit por IP, sanitización de chat y nicknames, validación de
  todo input, sin secretos en el repo.
- Retención horaria y guardia de tamaño para mantener la base de datos por debajo de 1 GB.
