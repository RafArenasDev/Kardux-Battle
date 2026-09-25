# ADR 0006: Mirror the card data locally instead of calling the source API during play

## Status

Accepted

## Context

Cards come from PokéAPI. Calling it every time a room is created would make the game depend on a
third-party service being up, fast and unchanged at that exact moment, and would add network
latency to creating a match.

## Decision

- A `card_pool_entries` table (`CardPoolEntry`: `source`, `externalId`, `quartetKey`, names,
  `imageUrl`, `stats` as JSON), unique per `(source, externalId)` and indexed by
  `(source, quartetKey)`.
- At boot, `CardPoolService` syncs the full Pokémon catalogue from PokéAPI when the pool is empty
  or older than a week. The sync runs in the background, never on the request path, and upserts
  by stable key: a failed or partial fetch never deletes existing rows.
- Decks are built from those rows (cached in memory), grouped into quartets by Pokémon type and
  drawn with the match's seeded RNG, so a deal stays reproducible.
- Each match also stores the exact deck it was dealt (`DeckSnapshot`).

## Alternatives considered

- **Live API per match with a short cache**: when the cache expires during an outage, creating a
  room fails.
- **Bundling a static JSON dataset in the repository**: no network at all, but corrections and new
  Pokémon upstream would require a code change.

## Consequences

- The game keeps working if PokéAPI is down; it only stops receiving new data until the next sync.
- Adding another deck means a new id in `DECK_SOURCE_IDS` and its own sync into the same table.
- The pool is about a thousand small rows, a few megabytes of the free database.
