# ADR 0005: OpenAPI docs generated from Zod, and Bruno as the HTTP client

## Status

Accepted

## Context

The REST surface (`POST /auth/guest`, `POST /matches`, `GET /matches/:code`,
`GET /matches/public`, `GET /leaderboard`, `GET /decks/sources`, `GET /health`) needs
documentation, and the project needs a way to exercise it by hand during development.
Postman requires an account and its desktop app has license/telemetry concerns the user
explicitly wants to avoid; the project's rule throughout is "free and open source, no
registration."

ADR 0002 already established that `@kardux/contracts`'s Zod schemas are the _only_ place a
payload shape is defined, so any docs solution that requires re-declaring shapes with
`@ApiProperty()`-style decorators would immediately drift from them.

## Decision

- **API docs**: `@nestjs/swagger` (official NestJS package, MIT) generates the OpenAPI
  document, served at `GET /api/docs` (Swagger UI) and `GET /api/docs-json` (raw OpenAPI
  JSON, importable by any client). Request/response schemas come from
  **`nestjs-zod`** (MIT), which converts the existing `@kardux/contracts` Zod schemas
  directly into OpenAPI schemas — no parallel DTO classes, no drift. This also means the
  Swagger UI's "Try it out" button is a working API client with zero extra install.
- **HTTP client for manual testing**: **Bruno** (open source, git-friendly, offline-first;
  no account required, unlike Postman/Insomnia's cloud-sync-first flows). Collections live in
  `apps/api/bruno/` as plain `.bru` text files, committed to the repo — reviewable in a PR
  like any other file, and reproducible by anyone who clones the project. Collection folders
  are added alongside each REST module as it's built (Phase 2), not created empty ahead of
  time.

## Alternatives considered

- **Postman**: rejected per explicit instruction (account/license friction).
- **Insomnia**: also pushes a Kong-account-based cloud sync as the default flow now; same
  category of friction as Postman.
- **Hoppscotch**: also fully open source and a reasonable alternative, but its natural habitat
  is a hosted web app or self-hosted server — Bruno's local-file, no-server model fits a
  single-developer monorepo better and needs nothing running to use it.
- **`class-validator` + `@nestjs/swagger`'s standard decorator flow**: rejected — it would
  mean every DTO shape exists twice (Zod schema for validation, decorated class for docs),
  which is exactly the drift ADR 0002 rules out.

## Consequences

- `apps/api` takes `@nestjs/swagger` and `nestjs-zod` as dependencies.
- Every Zod schema in `@kardux/contracts` that backs a REST endpoint needs a `.describe(...)`
  (or equivalent metadata) if we want the generated docs to read like real documentation
  instead of bare types — this is done as each endpoint is built, not retrofitted later.
- `CREDITS.md` / the README's tooling section should mention Bruno so a new contributor knows
  what `apps/api/bruno/*.bru` files are for.
