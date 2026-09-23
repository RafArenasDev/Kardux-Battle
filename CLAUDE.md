# CLAUDE.md — Kardux Battle

> Especificación viva del proyecto. Claude Code debe leer este archivo completo antes de
> escribir código y mantenerlo actualizado cuando una decisión cambie.
> Tareas por fase en `docs/tasks/`. Decisiones arquitectónicas en `docs/adr/`.

## Convenciones de trabajo

- Trabaja **por fases**, en el orden de `docs/tasks/`. No adelantes fases.
- Antes de cada fase: lista los archivos que vas a crear/tocar y espera confirmación.
- Después de cada fase: resumen de archivos, cómo probarlo, qué sigue.
- Prohibido `// TODO: implementar`, pseudocódigo o stubs vacíos. Código completo o nada.
- TypeScript `strict`. Todo input validado con Zod. Nada de `any`.
- Conventional Commits. Un commit por unidad lógica, no un commit gigante por fase.

## PRODUCTO

Nombre: **Kardux Battle**
Tagline: "Elige el atributo. Gánate la mesa."

### Identidad visual - revisión 2026-09-22 (`logo.png` real, reemplaza el diseño aspiracional)

El logo real entregado (`logo.png`, raíz del repo) es un escudo heráldico con corona
dorada/bronce, dos espadas cruzadas por detrás y un abanico de cartas ilustradas (no line-art
geométrico plano como se planeó originalmente) en tonos joya sobre navy profundo. La paleta y
el estilo de la UI se actualizaron para derivar de ese logo real en vez del boceto original:

- **Base**: obsidiana más profunda que el boceto original - `#05070F` (fondo), `#0E1424`
  (paneles sólidos), paneles traslúcidos `rgba(18,23,42,0.72)` con `backdrop-filter: blur(20px)
saturate(160%)` (materiales tipo Apple, no paneles opacos planos).
- **Oro/bronce** (acento primario, del marco/corona del logo): `#D9AC53` base, `#F4CF7E`
  brillante, `#8A6F3A` opaco - reemplaza el oro plano `#F2B441` original.
- **Tonos joya** (del abanico de cartas del logo, acentos por fuente de mazo/estado):
  ámbar/fuego `#FF7D47`, hielo `#5EC8F2`, turquesa `#35D9C4`, amatista `#B579EA`, acero `#9AA4C0`.
- **Estado de juego** (sin cambio): esmeralda victoria `#2DD4A7`, carmesí derrota `#EF4A5A`.
- Tipografía: display **Cinzel** (se mantiene, calza con el carácter heráldico del logo real),
  texto **Inter**. Tracking negativo en headings grandes, tracking neutro en cuerpo
  (`apps/web/src/index.css`).

El favicon/PWA/apple-touch-icon ya fueron generados a partir de este logo real (carpeta
`favicon/`, todos los tamaños) y viven en `apps/web/public/`.

## EL JUEGO (reglas canónicas)

Juego de cuartetos tipo "Top Trumps" por comparación de atributos numéricos.

1. **Mazo**: `N` paquetes × `M` cartas (por defecto 4 × 8 = 32). Cada carta se codifica
   `<número><letra>` donde número ∈ [1..N] y letra ∈ [A..M] (1A, 2A … 4H).
   Un "cuarteto" son las cartas que comparten letra (1C, 2C, 3C, 4C) y pertenecen a la
   misma familia temática. Todas las cartas del mazo comparten **exactamente el mismo
   conjunto de atributos numéricos** (3 a 6 atributos).
2. **Sala**: un jugador crea la partida y recibe un **código hexadecimal** de 6 caracteres
   (ej. `A3F9C1`). Los demás entran con ese código.
3. **Inicio**: el anfitrión puede iniciar manualmente cuando haya ≥ `minPlayers`.
   Si se alcanza `autoStartPlayers`, la partida inicia **automáticamente** al conectarse
   ese jugador (countdown visible de 5 s, cancelable solo por el anfitrión).
4. **Reparto**: se reparte todo el mazo en partes iguales; las cartas sobrantes se
   descartan aleatoriamente antes de repartir (`floor(total / jugadores) * jugadores`).
   Cada jugador recibe una **pila boca abajo**; solo ve la carta superior (su carta en juego).
5. **Primer turno**: lo inicia quien tenga la carta `1A`; si no está en juego, se busca en
   orden `1A, 1B … 1M, 2A, 2B …` la primera carta presente. El orden de turno posterior
   sigue el orden de conexión a la sala.
6. **Ronda**: el jugador en turno elige **un atributo** y baja su carta al centro boca arriba.
   Los demás, en orden, bajan su carta superior. Gana el valor **más alto** del atributo
   elegido y se lleva todas las cartas del centro al fondo de su pila.
7. **Empate en el primer puesto**: las cartas quedan en la mesa (pozo acumulado) y se juega
   una nueva ronda; el pozo se suma a lo que gane el vencedor de la ronda siguiente.
   Quien inicia la ronda de desempate es el jugador en turno de la ronda anterior.
8. **Siguiente ronda**: la inicia el ganador de la anterior, eligiendo atributo.
9. **Eliminación**: jugador sin cartas queda eliminado (pasa a espectador) y sale del
   orden de turno.
10. **Fin**: cuando un jugador tiene todas las cartas, o al superar `matchDuration`
    (por defecto 60 min). En ese caso gana quien tenga más cartas; si persiste el empate
    entre dos o más, se declara **empate**.

## VARIANTES OBLIGATORIAS RESPECTO A LAS REGLAS BASE

- `autoStartPlayers` es **configurable** (no fijo en 7).
- `matchDuration` es **configurable** (no fijo en 1 hora).
- El mazo se genera desde **APIs públicas gratuitas** elegidas al crear la partida.
- Multi-pestaña real (ver sección SESIONES).

## CONFIGURACIÓN DE PARTIDA (todo configurable desde el lobby)

```ts
interface MatchConfig {
    minPlayers: number; // default 2,  rango 2..12
    maxPlayers: number; // default 7,  rango 2..12
    autoStartPlayers: number; // default 7 — al llegar a este número inicia solo
    autoStartCountdownMs: number; // default 5000
    matchDurationMs: number; // default 3_600_000 (0 = sin límite)
    turnTimeoutMs: number; // default 30_000 (0 = sin límite)
    onTurnTimeout: 'random_attr' | 'highest_attr' | 'skip'; // default 'random_attr'
    packs: number; // N, default 4
    cardsPerPack: number; // M, default 8  => mazo de N*M
    attributeCount: number; // 3..6, default 4
    deckSources: DeckSourceId[]; // ['pokeapi'] | ['pokeapi','dragonball'] ...
    mixSources: boolean; // default false — true = mazo mixto entre universos
    allowSpectators: boolean; // default true
    fillWithBots: boolean; // default false
    visibility: 'public' | 'private';
    seed?: string; // semilla RNG para partidas reproducibles/tests
}
```

Validar con Zod y rechazar combinaciones imposibles (`autoStartPlayers > maxPlayers`,
`minPlayers > maxPlayers`, mazo insuficiente para los jugadores, etc.).

## FUENTES DE CARTAS (adaptadores)

Implementar un patrón **DeckProvider** con una interfaz común. Cada provider descarga
entidades de una API pública, las normaliza a `Card` y arma cuartetos coherentes.

> **Estado real de los datos (2026-09-22)**: `pokeapi`, `deckofcards` y `apitcg` (sets de
> Pokémon TCG) tienen datos reales sincronizados hoy vía el repo hermano
> `github.com/FlakoArenas26/tcg-github-sync` (`GET /decks/sources` ya los consume en vivo
> desde ese manifest, ver `docs/PENDING-WORK.md`). El resto de la tabla de abajo
> (`dragonball`, `naruto`, `digimon`, `rickmorty`, `swapi`, `superheroes`, `marvel`,
> `transformers`) sigue siendo solo el diseño aspiracional original - ningún dato sincronizado
> todavía para ninguno de ellos.

```ts
interface Card {
    code: string; // "1A"
    quartet: string; // "A"  (familia temática)
    name: string;
    imageUrl: string;
    source: DeckSourceId;
    stats: Record<string, number>; // mismas claves en TODO el mazo
}

interface DeckProvider {
    id: DeckSourceId;
    label: string; // "Pokémon"
    attributes: AttributeDef[]; // {key,label,unit,higherIsBetter}
    build(opts: { packs: number; cardsPerPack: number; rng: RNG }): Promise<Card[]>;
}
```

Providers a implementar (todas gratuitas y sin API key salvo aviso):

| id             | API                                                      | Base URL                                | Atributos sugeridos                                           | Agrupación de cuartetos      |
| -------------- | -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| `pokeapi`      | PokéAPI                                                  | `https://pokeapi.co/api/v2/`            | hp, attack, defense, speed, special-attack, weight            | por tipo elemental           |
| `dragonball`   | Dragon Ball API                                          | `https://dragonball-api.com/api/`       | ki, maxKi (parsear notación), affiliation→índice, edad        | por raza (saiyan, namekian…) |
| `naruto`       | Dattebayo API                                            | `https://dattebayo-api.onrender.com/`   | ninjutsu, taijutsu, genjutsu, inteligencia, fuerza, velocidad | por aldea                    |
| `digimon`      | Digi-API                                                 | `https://digi-api.com/api/v1/`          | nivel→índice, ataque, hp, tipo                                | por nivel de evolución       |
| `rickmorty`    | Rick & Morty API                                         | `https://rickandmortyapi.com/api/`      | nº episodios, estado, origen, id                              | por especie                  |
| `swapi`        | SWAPI (Star Wars)                                        | `https://swapi.info/api/`               | altura, masa, nº films, nº naves                              | por planeta natal            |
| `superheroes`  | SuperHero API (dataset JSON estático mirror)             | ver nota                                | intelligence, strength, speed, power, combat                  | por publisher                |
| `marvel`       | Marvel API _(requiere key gratuita)_                     | `https://gateway.marvel.com/v1/public/` | comics, series, stories, events                               | por serie                    |
| `transformers` | _(sin API estable pública)_ → dataset JSON local semilla | tech, firepower, speed, rank, courage   | por facción (autobot/decepticon)                              |

**Reglas duras para los providers:**

- Normalizar SIEMPRE a números; si un campo falta, derivar un valor determinista
  (p. ej. hash del id) o descartar la entidad, nunca `NaN`.
- Rechazar entidades sin imagen.
- Garantizar que todas las cartas del mazo compartan idénticas `stats` keys.
- **Caché en dos niveles**: Redis (TTL 24 h) + snapshot del mazo persistido en la BD
  al crear la partida (la partida debe seguir siendo jugable y reproducible aunque
  la API externa caiga).
- Rate limiting y `p-retry` con backoff exponencial; timeout de 8 s por request.
- Añadir un provider `local` con un mazo semilla embebido para desarrollo y tests offline.
- Adjuntar la atribución de cada API en un `CREDITS.md` y en el footer de la app.

### Espejo local persistente (`CardPoolEntry`) — decisión 2026-09-21

Pedido explícito: no depender de que las APIs externas estén arriba en el momento de crear
CADA partida, y garantizar que siempre tengamos el dataset COMPLETO de cada fuente disponible,
aunque la API original desaparezca. El caché Redis de 24h de arriba resuelve caídas cortas;
esto resuelve la caída permanente de una fuente.

- Tabla nueva `CardPoolEntry` (Postgres, vía Prisma): `source`, `externalId`, `quartetKey`,
  `name`, `imageUrl`, `stats` (JSONB), `syncedAt`. Único por `(source, externalId)`, índice
  por `(source, quartetKey)`.
- **Job de sincronización por provider** (`@nestjs/schedule`, cron semanal + endpoint admin
  para forzar un refresh manual): pagina el dataset COMPLETO de la API de origen (todos los
  Pokémon, todos los personajes de Dragon Ball, etc.), normaliza cada entidad igual que
  `DeckProvider.build()` ya hace, y hace upsert en `CardPoolEntry`.
- **`DeckBuilder.build()` deja de llamar a la API en vivo en el camino normal**: arma el mazo
  muestreando (con el RNG sembrado, para que siga siendo determinista/reproducible)
  `CardPoolEntry` de nuestra propia BD, agrupando por `quartetKey`. Sólo llama a la API en
  vivo cuando el pool local de esa fuente está vacío (primer arranque) o cuando el job de
  sync corre — nunca en el camino crítico de "crear partida".
- Consecuencia: si `dattebayo-api.onrender.com` desaparece mañana, seguimos pudiendo armar
  mazos de Naruto indefinidamente con lo que ya sincronizamos — sólo dejamos de recibir
  personajes NUEVOS de esa fuente, nunca perdemos la capacidad de jugar con ella.
- Ver ADR 0006 para el detalle completo y las alternativas consideradas.

## ARQUITECTURA

Monorepo pnpm + Turborepo:

```
kardux-battle/
├─ apps/
│  ├─ api/          # NestJS: REST + Socket.IO gateway
│  ├─ web/          # React + Vite (PWA)
│  ├─ desktop/      # Tauri 2 (envuelve web)
│  └─ mobile/       # Expo / React Native
├─ packages/
│  ├─ engine/       # motor de reglas PURO (sin I/O) + RNG seeded
│  ├─ contracts/    # tipos + esquemas Zod de eventos socket y DTOs
│  ├─ providers/    # adaptadores de las APIs de cartas
│  └─ ui/           # design tokens + componentes compartidos web/mobile
├─ docker/          # compose: postgres, redis, api, web
└─ docs/            # diagramas, ADRs
```

Principio no negociable: **servidor autoritativo**. El cliente nunca decide el resultado
de una ronda ni conoce cartas ajenas. El estado se envía **redactado por jugador**:
cada socket recibe solo su carta superior, el conteo de cartas de los demás y lo que hay
en el centro.

## MÁQUINA DE ESTADOS

`LOBBY → COUNTDOWN → DEALING → AWAITING_ATTRIBUTE → AWAITING_CARDS → REVEAL → RESOLVE
→ (AWAITING_ATTRIBUTE | TIE_POT | FINISHED)`

- El motor expone `reduce(state, action): { state, events[] }` y es **determinista**
  dada una semilla. Prohibido usar `Math.random()` o `Date.now()` dentro del motor:
  ambos se inyectan.
- Cada estado emitido lleva `version: number` monotónico para detectar desincronización.

## CONTRATO DE EVENTOS SOCKET.IO (namespace `/game`)

Cliente → Servidor:

| Evento                  | Payload                          | Notas                                      |
| ----------------------- | -------------------------------- | ------------------------------------------ |
| `match:create`          | `MatchConfig`                    | devuelve `{ code, matchId, token }`        |
| `match:join`            | `{ code, nickname, avatarSeed }` | error tipado si sala llena/en curso        |
| `match:rejoin`          | `{ token }`                      | reconexión con gracia de 45 s              |
| `match:config`          | `Partial<MatchConfig>`           | solo anfitrión, solo en LOBBY              |
| `match:start`           | `{}`                             | solo anfitrión, ≥ minPlayers               |
| `match:leave`           | `{}`                             |                                            |
| `round:selectAttribute` | `{ attribute }`                  | solo jugador en turno                      |
| `round:playCard`        | `{}`                             | baja la carta superior; auto si `autoPlay` |
| `chat:send`             | `{ text }`                       | rate-limited, sanitizado                   |
| `ping:latency`          | `{ t }`                          | RTT para el HUD                            |

Servidor → Cliente:
`match:state` (snapshot redactado) · `match:playerJoined` · `match:playerLeft` ·
`match:countdown` · `match:started` · `round:started` · `round:attributeSelected` ·
`round:cardPlayed` · `round:revealed` · `round:resolved` (ganador, cartas ganadas, pozo) ·
`round:tie` · `turn:timer` · `match:finished` (standings) · `error` (código + mensaje i18n).

Todos los payloads validados con Zod en ambos extremos y exportados desde `@kardux/contracts`.

## SESIONES MULTI-PESTAÑA (requisito crítico)

Debe ser posible abrir 7 **pestañas** del mismo navegador y tener 7 jugadores distintos.

- **Prohibido**: cookies, `localStorage` o cualquier estado de auth compartido entre pestañas.
- Identidad por pestaña: `tabId = crypto.randomUUID()` guardado en `sessionStorage`
    - JWT del jugador también en `sessionStorage`.
- Al duplicar una pestaña (Ctrl+D copia `sessionStorage`), detectar colisión con
  `BroadcastChannel('kardux-tabs')`: si otra pestaña viva reclama el mismo `tabId`,
  regenerar identidad y forzar re-join.
- Enviar `tabId` en el handshake del socket (`auth: { token, tabId }`) y usar
  `playerKey = userId + ':' + tabId` como clave de jugador en el servidor.
- Indicador visual en la pestaña: nickname en `document.title` y favicon coloreado por
  jugador, para no perderse entre 7 pestañas mientras pruebas.
- **Modo dev**: pantalla `/dev/tabs` que abre N pestañas con nicknames autogenerados
  y auto-join a un código dado, para levantar una partida completa en 2 clics.

## INTERFAZ Y MESA DE JUEGO

Layout recomendado: **mesa radial**. El jugador local siempre abajo al centro con su
carta ampliada; los rivales se distribuyen en un arco elíptico superior, escalando el radio
según la cantidad de jugadores. En el centro, el **pozo** con las cartas jugadas en abanico.

Zonas: HUD superior (código de sala, cronómetro de partida, ronda, latencia) ·
arco de rivales (avatar, nickname, contador de cartas, aro de progreso del turno) ·
pozo central · mano local (carta grande con atributos clicables) · panel lateral colapsable
(tabla de posiciones en vivo + log de rondas + chat).

En mobile: la mesa se reordena a columna — rivales como chips horizontales scrollables arriba,
pozo al centro, carta local abajo ocupando el 45 % del alto. Breakpoint 768 px.

**Animaciones (Framer Motion, 60 fps, `transform`/`opacity` únicamente):**

| Momento               | Animación                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Reparto inicial       | cartas salen del mazo central y vuelan a cada pila, stagger 40 ms, arco bézier                                                                 |
| Selección de atributo | fila del atributo se ilumina y pulsa; las demás bajan a 40 % opacidad                                                                          |
| Envío al centro       | `layoutId` compartido: la carta vuela de la mano al pozo con rotación leve (-6°..6°) y sombra dinámica; spring `{stiffness: 260, damping: 26}` |
| Cartas rivales        | llegan boca abajo en secuencia (stagger 120 ms) y se voltean todas a la vez en `REVEAL` (flip 3D, `rotateY`, 450 ms)                           |
| Comparación           | contador numérico animado por carta; la ganadora crece 8 %, borde oro, glow; las perdedoras desaturan                                          |
| Cobro del pozo        | las cartas se agrupan en mazo y vuelan a la pila del ganador con "pop" al aterrizar + partículas                                               |
| Empate                | las cartas se apilan al centro con un sello "POZO ×N" y vibración sutil                                                                        |
| Eliminación           | avatar del jugador se desatura y se contrae a un chip de espectador                                                                            |
| Victoria              | confeti, escudo Kardux con las espadas cruzándose, tabla final en cascada                                                                      |

Respetar `prefers-reduced-motion`: sustituir vuelos por fundidos de 120 ms.
Sonido opcional (Howler.js): repartir, bajar carta, revelar, ganar pozo, tic-tac final.

## TABLA DE POSICIONES

- **En partida**: ranking en vivo por cantidad de cartas, con animación de reordenamiento
  (`layout` de Framer Motion) y delta respecto a la ronda anterior.
- **Global (persistida)**: partidas jugadas, ganadas, %, cartas acumuladas, racha máxima,
  rondas ganadas, atributo favorito, y un **Elo** (K=32, 1200 inicial) adaptado a N jugadores
  (cada jugador se compara contra cada rival como mini-duelo).
- Filtros: global / por fuente de cartas / hoy / semana / amigos. Paginación keyset.
- Endpoint `GET /leaderboard?scope=&period=&cursor=`.

## BASE DE DATOS (PostgreSQL + Prisma)

Entidades mínimas: `User` · `Match` (code, config JSONB, status, seed, startedAt, endedAt,
winnerId) · `MatchPlayer` (matchId, userId, seat, joinOrder, finalCards, placement, eliminatedAt)
· `Round` (matchId, index, attribute, leaderId, winnerId, potSize, playedCards JSONB) ·
`DeckSnapshot` (matchId, cards JSONB) · `LeaderboardStat` (userId, elo, wins, losses, streak…)
· `MatchEvent` (log append-only para replays).

Índices: `Match.code` único parcial sobre partidas activas, `Round(matchId,index)`,
`LeaderboardStat.elo desc`. Migraciones versionadas, seeds de desarrollo, y
`DATABASE_PROVIDER` que permita conmutar entre `postgresql` y `sqlite` en dev.

## MULTIPLATAFORMA

- **Web**: PWA instalable, offline shell, manifest con el icono del escudo.
- **Desktop**: Tauri 2, builds para Windows/macOS/Linux, deep link `kardux://join/<code>`.
- **Mobile**: Expo (iOS/Android), misma capa de sockets, safe areas, haptics en el turno propio.
- El 100 % de la lógica vive en `@kardux/engine` + `@kardux/contracts`; las apps solo pintan.

## README (entregable obligatorio)

Debe incluir, con diagramas **Mermaid**:

1. Portada con logo, badges (CI, licencia, cobertura) y demo GIF.
2. Descripción y reglas.
3. **Diagrama de arquitectura C4 nivel 2** (contenedores: web/desktop/mobile → API → engine,
   Postgres, Redis, APIs externas).
4. **Diagrama de secuencia** de una ronda completa (elegir atributo → jugar → revelar → resolver).
5. **Diagrama de estados** de la partida.
6. **ER** de la base de datos.
7. Diagrama de componentes del frontend.
8. Tabla completa del contrato de eventos socket.
9. Stack y justificación (ADRs cortos en `docs/adr/`).
10. Instalación: `pnpm i`, `docker compose up`, variables de entorno (`.env.example` comentado).
11. Scripts, testing, cómo probar multi-pestaña, despliegue, roadmap, créditos de las APIs, licencia MIT.
12. Versión en español e inglés (`README.md` / `README.es.md`).

### Idioma de la documentación Swagger — decisión 2026-09-21

Revertido: el pedido original de descripciones bilingües (ES/EN) en cada endpoint se sentía
"apeñuscado" en Swagger UI (dos idiomas mezclados en el mismo bloque de texto). A partir de
ahora toda la documentación de OpenAPI/Swagger (`@ApiOperation`, `@ApiBody`, `@ApiResponse`,
tags) se escribe **solo en inglés** — estándar profesional para documentación de API — igual
que el resto del código. El español queda para la eventual UI del frontend (y ahí también se
traduce a inglés más adelante, per la sección MULTIPLATAFORMA).

## CALIDAD

- TypeScript `strict`, ESLint + Prettier, Husky + lint-staged, Commitlint (Conventional Commits).
- Tests: **Vitest** unitario sobre `@kardux/engine` (cobertura ≥ 90 %: empates encadenados,
  eliminación, timeout, fin por tiempo, mazo no divisible, reconexión),
  **Supertest** para REST, **socket.io-client** para pruebas de integración del gateway,
  **Playwright** con N browser contexts simulando 7 jugadores en paralelo (E2E de partida completa).
- Logs estructurados (Pino) con `matchId` en cada línea; healthcheck `/health`; métricas Prometheus.
- Seguridad: Helmet, CORS whitelist, rate limit por IP y por socket, sanitización de nicknames
  y chat, validación de todo input, sin secretos en el repo.
- Docker Compose para levantar todo con un comando; Dockerfile multi-stage para la API.
- GitHub Actions: lint → test → build → (opcional) deploy.

## CRITERIOS DE ACEPTACIÓN

1. 7 pestañas del mismo navegador = 7 jugadores independientes, sin fugas de sesión.
2. La partida inicia sola al alcanzar `autoStartPlayers`, configurado en el lobby.
3. La partida termina por `matchDurationMs` y declara ganador por conteo de cartas, o empate.
4. Empates generan pozo acumulado que se cobra correctamente en la ronda siguiente.
5. Ningún cliente puede ver cartas ajenas ni forzar una jugada fuera de turno (probarlo con
   un test que emita eventos maliciosos).
6. Reconectar una pestaña restaura el estado exacto sin perder el turno.
7. El mazo se construye desde al menos 3 APIs distintas, seleccionables al crear la partida.
8. Todo lo anterior corre en web, desktop y mobile desde el mismo monorepo.

## CÓMO QUIERO QUE TRABAJES

Fase 0: plan + estructura del monorepo + ADRs. Fase 1: `@kardux/contracts` y `@kardux/engine`
con tests. Fase 2: API NestJS (REST + gateway + Prisma + Redis). Fase 3: providers de cartas.
Fase 4: frontend web + animaciones. Fase 5: leaderboard. Fase 6: desktop y mobile.
Fase 7: README, diagramas, Docker, CI.
Al final de cada fase: resumen de archivos creados, cómo probarlo y qué sigue. Espera mi "ok".
