# ADR-0001: Modular monolith and module boundaries

- Status: Accepted
- Date: 2026-08-01
- Requirement source: TZ v1.1 §4.1–4.3, Appendix D (ADR-001, "Принять до scaffold")

## Context

The TZ mandates a modular monolith with seven modules (Identity, Catalog,
Ordering, Content, Admin, Audit, Notifications) that must not reach into each
other's persistence or bypass domain policy, and an explicit monorepo layout
(§4.3) separating delivery, application, domain, and infrastructure concerns.
This decision must be recorded before any application code is scaffolded.

## Decision

Adopt the monorepo layout exactly as specified in TZ §4.3:

- `apps/web` — Next.js delivery layer (public site, account, admin, REST
  endpoints). May depend on all `packages/*`.
- `apps/worker` — background outbox/notification/scheduled-task processing.
  May depend on `packages/domain`, `packages/application`,
  `packages/infrastructure`.
- `packages/domain` — entities, value objects, policies, domain events. Zero
  runtime dependencies; must not import Next.js, Prisma, transport, or OIDC
  SDKs.
- `packages/application` — use cases, ports, transactional boundaries. May
  depend only on `packages/domain`.
- `packages/infrastructure` — Prisma, OIDC, mail, object storage, telemetry
  adapters. May depend on `packages/domain` and `packages/application`.
- `packages/contracts` — OpenAPI 3.2, JSON Schema 2020-12, generated types,
  RFC 9457 error catalogue. May depend on `packages/domain` (for the domain
  error type it maps into Problem Details).
- `packages/ui` — shared accessible components and design tokens. No
  dependency on domain/application/infrastructure.
- `infra` — Docker, Collector, reverse proxy, IaC/deploy manifests.

Boundary enforcement for Phase 0:

1. **Dependency graph (currently the only active layer — see below)**: a
   package can only import what its own `package.json` declares;
   `packages/domain` and `packages/application` declare zero
   framework/ORM/OIDC dependencies, so those imports cannot resolve at all.
   TypeScript project references (`tsconfig.json` per package plus root
   `tsconfig.base.json`) encode the same dependency direction, and `tsc -b`
   (strict, real TypeScript 7 everywhere — no shim, see ADR-0012) fails with
   "Cannot find module" on an undeclared cross-package or framework import.
   This is a real, build-breaking check, not advisory.
2. **Static lint rule (currently suspended, not deleted)**: a
   `no-restricted-imports` rule forbidding `next`, `react`, `@prisma/client`,
   and `openid-client` imports in `packages/domain`/`packages/application`
   was implemented and verified working (by injecting
   `import next from 'next'` into `packages/domain/src/locale.ts` and
   confirming ESLint failed with `'next' import is restricted from being
used by a pattern`), but ESLint's TypeScript-aware integration is
   currently disabled entirely per ADR-0012 (typescript-eslint doesn't
   support TypeScript 7 yet), which necessarily disables this rule along
   with all other `.ts` linting. The pattern list is still exported from
   `eslint.config.js` as `frameworkImportPatterns` so this layer can be
   restored in one step once ADR-0012's re-enable trigger fires. Until then,
   layer 1 is the sole enforcement mechanism, and it is sufficient on its
   own to make a violation fail the build.

## Consequences

- Phase 1 aggregates (User, Company, Order, etc.) and their repository
  adapters must respect this boundary from the first commit; a repository
  interface belongs in `packages/application` (port) with its Prisma
  implementation in `packages/infrastructure` (adapter).
- Adding a new framework dependency to `packages/domain` or
  `packages/application` requires either removing it or revisiting this ADR.
- `packages/contracts` depending on `packages/domain` is the one intentional
  exception to "domain has zero dependents inside packages/"; it is a
  one-directional read (mapping `DomainError` subclasses to Problem Details),
  not a cycle.
