# Modo Casino — diseño propuesto (pendiente de aprobación)

> Estado: **especificación**, sin código todavía. Las batallas de cartas (comparar atributos) y
> los juegos de baraja francesa son juegos distintos: comparten la baraja y la mesa, **nada más**.
> Este documento define cómo se separan y qué hay que decidir antes de programar.

## 1. Por qué es un módulo aparte

|                      | Batalla de cartas (hoy)                    | Casino (propuesto)                                |
| -------------------- | ------------------------------------------ | ------------------------------------------------- |
| Objetivo             | Quedarte con todas las cartas              | Ganar fichas / la mano                            |
| Decisión del jugador | Elegir el atributo                         | Apostar, pedir, plantarse, descartar, retirarse…  |
| Cartas en juego      | La de encima de tu pila, siempre           | Manos privadas + cartas comunitarias              |
| Motor                | `@kardux/engine` (`reduce()` de cuartetos) | `@kardux/casino-engine` (un `reduce()` por juego) |
| Mazos                | Pokémon, Máquinas, Criaturas Míticas       | Baraja francesa de 52 (deckofcardsapi)            |

Nada del motor de batallas se reutiliza para las reglas. Se reutiliza la infraestructura:
sesiones, sockets, salas privadas/rápidas, Redis, reconexión, `CardPoolEntry` y el diseño visual.

## 2. Arquitectura

```
packages/
  engine/          # batallas (sin cambios)
  casino-engine/   # NUEVO: motor puro por juego, determinista con semilla
    src/deck.ts            # baraja 52, barajar con el RNG sembrado, repartir, quemar
    src/hand-rank.ts       # evaluador de manos de póker (escalera real … carta alta)
    src/games/holdem.ts    # Texas Hold'em
    src/games/blackjack.ts # 21
    src/games/baccarat.ts  # Baccarat (punto y banca)
    src/games/rummy.ts     # Rummy / 51
contracts/src/casino/      # estados redactados y eventos socket por juego
apps/api/src/casino/       # CasinoGateway (namespace /casino), runtime, persistencia
apps/web/src/features/casino/  # lobby de casino + una mesa por juego
```

- Mismo principio no negociable: **servidor autoritativo**; cada cliente recibe solo sus cartas.
- Arte: la cara completa de la carta de deckofcardsapi (`/static/img/AS.png`) y su reverso
  (`/static/img/back.png`) dentro del marco dorado de Kardux, sin nada más encima.
- Animaciones propias: repartir desde el zapato, voltear comunitarias, empujar fichas al pozo,
  recoger el pozo hacia el ganador.

## 3. Reglas por juego (resumen)

**Texas Hold'em (2–9 jugadores).** 2 cartas privadas; ciegas pequeña/grande; rondas de apuesta
pre-flop, flop (3), turn (1), river (1); acciones: pasar, igualar, subir, retirarse, all-in;
gana la mejor mano de 5 entre 7 cartas; bote y botes laterales.

**Blackjack / 21 (1–7 contra la banca).** Apuesta → 2 cartas a cada uno, banca con una oculta;
pedir, plantarse, doblar, dividir; la banca pide hasta 17; 21 natural paga 3:2.

**Baccarat (1–7 contra la banca).** Apuesta a Jugador, Banca o Empate; reglas fijas de tercera
carta; el jugador no toma decisiones después de apostar.

**Rummy / 51 (2–4 jugadores).** Reparto de 7–13 cartas; robar del mazo o del descarte; bajar
tríos/escaleras (en 51 la primera bajada debe sumar 51 puntos); descartar; gana quien se
queda sin cartas.

## 4. Decisiones que necesito de ti antes de programar

1. **Orden**: ¿qué juego va primero? Recomendación: **Blackjack** (reglas acotadas, contra la
   banca, se juega bien con 1 persona), luego Hold'em, luego Baccarat y Rummy/51.
2. **Fichas**: ¿fichas virtuales sin valor real, con saldo diario gratis? Recomendación: sí,
   **nunca dinero real ni compras** (evita regulación de juegos de azar).
3. **Rival**: en Blackjack/Baccarat, ¿la banca la maneja el servidor? (recomendado). En Hold'em,
   ¿bots para completar mesa o solo humanos?
4. **Persistencia**: saldo de fichas por cuenta registrada (tabla nueva) — los invitados juegan
   con saldo temporal por sesión.

## 5. Estimación

Cada juego es un motor + mesa propios. Orden de magnitud: Blackjack ≈ 1 sesión, Baccarat ≈ 1,
Hold'em ≈ 2–3 (evaluador de manos, botes laterales), Rummy/51 ≈ 2.
