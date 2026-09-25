# ADR 0001: pnpm workspaces + Turborepo for the monorepo

## Status

Accepted

## Context

The server and the web client must share the same contracts (types, Zod schemas, error codes,
table timing) and the server must run a rules engine that is tested in isolation. Copying types
between two repositories drifts sooner or later, so everything lives in one repository with
cross-package `workspace:*` dependencies.

## Decision

**pnpm** for package management and **Turborepo** for task orchestration (`build`, `dev`,
`lint`, `typecheck`, `test`). `packages/*` holds framework-agnostic code (`contracts`, `engine`,
`content`); `apps/*` holds what runs somewhere (`api`, `web`).

- pnpm's strict `node_modules` layout means a package can only import what it declares. That
  matters for `@kardux/engine`, which must stay free of I/O and framework dependencies.
- Turborepo caches task output per package and builds the shared packages before the apps
  (`dependsOn: ["^build"]`).

## Alternatives considered

- **npm/yarn workspaces alone**: they work, but every build and test run touches the whole graph.
- **Nx**: more powerful, but a larger configuration surface than a two-app monorepo needs.

## Consequences

- Every package has its own `package.json` and `tsconfig.json` extending `tsconfig.base.json`.
- `turbo.json` is the single source of truth for task dependencies; a new package has to be
  wired into it.
- Deploying means building the whole workspace (`pnpm build:render` on Render).
