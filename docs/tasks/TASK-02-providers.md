# Fase 3 — Proveedores de cartas (`packages/providers`)

> Requiere `CLAUDE.md` y las fases 1–2 terminadas.

Implementa el paquete `@kardux/providers` con la interfaz `DeckProvider` definida en `CLAUDE.md`.

1. Providers obligatorios: `local` (dataset embebido, offline, usado en tests), `pokeapi`,
   `dragonball`, `naruto`, `digimon`, `rickmorty`, `swapi`.
2. Cada provider debe:
    - descargar en paralelo con concurrencia limitada (`p-limit`, máx. 6) y timeout de 8 s;
    - reintentar con backoff exponencial (`p-retry`, 3 intentos);
    - descartar entidades sin imagen o sin atributos completos;
    - normalizar todos los atributos a `number`, nunca `NaN`;
    - agrupar en cuartetos coherentes según la columna "Agrupación" de `CLAUDE.md`;
    - ser determinista dado el mismo `rng` sembrado.
3. Escala canónica para `mixSources: true`: cada provider debe exponer además un mapeo a
   `{ power, speed, defense, stamina }` normalizado 0–100, para que mezclar universos
   produzca comparaciones justas.
4. Caché: interfaz `DeckCache` (implementación Redis en la API, in-memory en tests), TTL 24 h.
5. `DeckBuilder.build(config)` que combina providers, valida homogeneidad de claves de `stats`,
   asigna códigos `1A..NM` y devuelve el mazo listo para `DeckSnapshot`.
6. Tests con `msw` o `nock` interceptando las APIs (sin red real en CI) + un test de
   contrato por provider que valide el shape normalizado.
7. Endpoint `GET /decks/sources` de la API debe listar los providers con sus atributos y
   un preview de 4 cartas.
8. `CREDITS.md` con la atribución de cada API.
