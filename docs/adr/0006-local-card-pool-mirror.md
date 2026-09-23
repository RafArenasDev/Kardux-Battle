# ADR 0006: Mirror every deck source into a local `CardPoolEntry` table

## Status

Accepted

## Context

the spec's original design has `DeckProvider.build()` call the source API live every time a
match is created, with a two-level cache (Redis 24h TTL + a per-match `DeckSnapshot` so an
already-created match survives an outage). That protects a match already in progress, but it
does nothing for _new_ matches if a source API goes down for good, or a nickname/URL changes
upstream (several of the sources in the spec's table are small community-run APIs -
`dattebayo-api.onrender.com` free-tier hosting, `dragonball-api.com`, `digi-api.com` - with no
uptime guarantee at all).

The explicit goal is stronger than "survive a short outage": always have the _complete_
dataset of every source available to build decks from, indefinitely, even if the origin API
disappears entirely.

## Decision

Add a `CardPoolEntry` table (Postgres, via Prisma) that mirrors the full normalized dataset of
every deck source:

```
model CardPoolEntry {
  id         String   @id @default(cuid())
  source     String   // DeckSourceId
  externalId String   // the id from the origin API
  quartetKey String   // computed at sync time (type / race / village / evolution stage / ...)
  name       String
  imageUrl   String
  stats      Json     // Record<string, number>, same normalization DeckProvider already does
  syncedAt   DateTime

  @@unique([source, externalId])
  @@index([source, quartetKey])
}
```

- A **sync job per provider** (`@nestjs/schedule` cron, weekly by default, plus an admin
  endpoint to trigger it on demand) paginates the _entire_ dataset of that source, runs it
  through the same normalization `DeckProvider` already does, and upserts every entity into
  `CardPoolEntry`.
- `DeckBuilder.build()` is rewritten to sample from `CardPoolEntry` (grouped by `quartetKey`,
  drawn with the match's seeded RNG so deck construction stays deterministic/reproducible)
  instead of calling the live API on the match-creation path. The live API is only ever called
  by the sync job, or once, automatically, the first time a source's pool is empty (bootstrap).
- The existing Redis cache and per-match `DeckSnapshot` (docs/SPEC.md, unchanged) still apply on
  top of this - this ADR replaces "call the live API per match" with "call our own mirror per
  match," it doesn't remove the other two cache layers.

### Sync mechanics: when it runs, and what happens when a source is down

A Prisma migration only creates the empty `CardPoolEntry` table - it does not, by itself, put
any data in it. Filling it is a separate, explicit step (`CardPoolSyncService`), triggered
three ways:

1. **Bootstrap on first boot.** An `OnApplicationBootstrap` hook in `apps/api` checks, per
   source, whether `CardPoolEntry` already has any rows for it. A source with zero rows (the
   very first run, right after the migration that created the table) gets synced immediately
   so the pool isn't empty when the first match tries to build a deck from it. A source that
   already has rows is left alone at boot - restarting the server should never itself trigger
   nine live API calls.
2. **Scheduled refresh.** `@Cron(CronExpression.EVERY_WEEK)` calls a full sync of every source,
   to pick up new entities (new Pokémon, new episodes, ...) and corrections upstream.
3. **Manual trigger.** An admin-only endpoint (`POST /admin/decks/sync`) runs the same sync on
   demand - useful right after `pnpm --filter @kardux/api exec prisma migrate dev` on a fresh
   database, instead of waiting for either of the above.

Every one of these calls the **same per-source sync function**, and every source is
independent:

```ts
async function syncSource(provider: DeckProvider): Promise<SyncOutcome> {
    let entities: NormalizedEntity[];

    try {
        entities = await provider.fetchAll(); // paginate the *entire* upstream dataset
    } catch (error) {
        // Network error, timeout, 5xx, schema drift - whatever it is, existing rows for
        // this source are untouched. A different source's sync result is unaffected too;
        // syncAll() awaits each source independently (Promise.allSettled, not Promise.all).
        return { source: provider.id, status: 'failed', reason: String(error), keptExisting: true };
    }

    // Never a destructive delete-then-reinsert: each entity is upserted by its stable
    // (source, externalId) key, so an entity missing from *this* fetch (a pagination
    // fluke, a temporary removal upstream) simply isn't touched, not deleted. A quartet
    // built from CardPoolEntry two weeks from now can still include something that
    // dropped out of the latest fetch - an acceptable trade-off for never losing data
    // over a source's own instability.
    await upsertAll(entities);

    return { source: provider.id, status: 'ok', count: entities.length };
}
```

So, concretely, answering "what happens if PokéAPI is fine but the Naruto API is down": the
sync run updates/patches every Pokémon entity (new ones inserted, changed stats updated) and
reports the Naruto source as failed while leaving its existing `CardPoolEntry` rows exactly as
they were - `DeckBuilder` keeps serving Naruto decks from that last-known-good data, with zero
special-casing needed on the deck-building path (it doesn't know or care whether a row is
fresh from five minutes ago or three weeks ago).

## Alternatives considered

- **Keep calling the live API per match, rely on the 24h Redis cache**: rejected - a cache
  entry expires, and expiry plus a source being down at that exact moment means match creation
  fails. It also does nothing if a source disappears permanently; the whole deck source would
  just stop working the moment nobody has a warm cache entry left.
- **Vendor a static JSON snapshot of each API into the repo once, never refresh it**: rejected
    - decks would go stale forever (new Pokémon, new episodes, etc. never show up), and it still
      doesn't solve "what if this dataset needs correcting or the source changes its schema before
      we vendor it."
- **Mirror only on first use, per deck, instead of the whole dataset upfront**: rejected -
  quartets need to be _coherent_ (docs/SPEC.md's grouping column, e.g. "por tipo elemental" for
  Pokémon); building quartets correctly needs the full picture of a category, not just
  whichever entities happened to be requested first.

## Consequences

- `packages/providers` (Phase 3, not started yet) needs a sync job per provider in addition to
  the normalization logic `TASK-02-providers.md` already asks for - this is now part of that
  phase's scope, not a later addition.
- `apps/api` gains one new Prisma model and a scheduled job; both land when Phase 3 actually
  starts, not before (no schema changes ahead of the phase that needs them).
- Deck variety over time depends on how often the sync job runs, not on how often a match is
  created - a sensible trade-off, since dataset content (e.g. new Pokémon) changes far less
  often than matches get created.
