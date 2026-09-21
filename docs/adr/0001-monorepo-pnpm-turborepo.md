# ADR 0001: pnpm workspaces + Turborepo for the monorepo

## Status

Accepted

## Context

Kardux Battle ships four apps (`api`, `web`, `desktop`, `mobile`) that must all consume the
same rules engine (`@kardux/engine`) and the same event/DTO contracts (`@kardux/contracts`)
without duplicating logic. That requires a monorepo with fast, correct incremental builds and
a package manager that handles cross-package `workspace:*` dependencies well.

## Decision

Use **pnpm** for package management and **Turborepo** for task orchestration (`build`, `dev`,
`lint`, `typecheck`, `test`), with `packages/*` for pure, framework-agnostic code and
`apps/*` for anything that ships to a runtime or a store.

- pnpm's content-addressable store and strict `node_modules` layout catch accidental
  cross-package imports early (a package can only resolve what it actually declares as a
  dependency), which matters here because `@kardux/engine` must stay free of I/O and
  framework dependencies.
- Turborepo caches task output per package and only re-runs what changed, which keeps the
  inner loop fast once `apps/desktop` and `apps/mobile` join the workspace.

## Alternatives considered

- **npm/yarn workspaces without Turborepo**: works, but every `test`/`build` run touches the
  whole graph; not worth the slowdown once four apps exist.
- **Nx**: more powerful generators and a task graph UI, but heavier configuration surface than
  this project needs — Turborepo's `turbo.json` pipeline is enough for the four task types
  above.

## Consequences

- Every package needs its own `package.json` and `tsconfig.json` (extending
  `tsconfig.base.json`) even when small.
- `turbo.json` is the single source of truth for how tasks depend on each other
  (`dependsOn: ["^build"]` etc.) — new packages must be wired into it explicitly.
