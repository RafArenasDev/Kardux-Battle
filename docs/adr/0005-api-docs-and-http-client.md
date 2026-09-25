# ADR 0005: OpenAPI documentation generated from the Zod contracts

## Status

Accepted

## Context

The REST API needs documentation that stays correct as the code changes, and a way to try every
endpoint by hand. Since `@kardux/contracts` is the only place a payload shape is defined
(ADR 0002), a documentation approach that re-declares shapes with decorators would drift.

## Decision

- `@nestjs/swagger` generates the OpenAPI document, served at `/api/docs` (Swagger UI).
- Request and response schemas come from `nestjs-zod`, which converts the existing Zod schemas
  directly: no parallel DTO classes.
- Swagger UI doubles as the manual testing client: _Sign in_ or _Play as guest_, **Authorize**
  with the returned token, then _Try it out_ on any endpoint. Descriptions are available in
  Spanish and English through a selector.
- The documentation is public in production: <https://kardux-battle.onrender.com/api/docs>.

## Alternatives considered

- **Hand-written OpenAPI or a wiki page**: out of date after the first change.
- **`class-validator` DTOs with `@ApiProperty()`**: every shape would exist twice.
- **A committed collection for a desktop HTTP client**: one more artifact to keep in sync; the
  generated OpenAPI document can be imported into any client when needed.

## Consequences

- Every Zod schema behind an endpoint carries `.describe(...)` metadata so the generated docs
  read like real documentation.
- Error responses document the stable error codes (`ERR_MATCH_FULL`, `ERR_NOT_YOUR_TURN`, ...)
  that the client translates.
