# ADR-0002: Next.js deployment topology — web + worker

- Status: Accepted
- Date: 2026-08-01
- Requirement source: TZ v1.1 §4.2–4.3, §15.2–15.3, Appendix D (ADR-002,
  "Принять до infra")

## Context

The platform needs both a request/response delivery surface (public site,
account, admin, REST API) and asynchronous background processing (outbox
dispatch, notifications, scheduled/regulatory tasks per §6.8, §15.2 graceful
shutdown). The TZ's monorepo layout already names `apps/web` and
`apps/worker` as separate deployables; this ADR fixes how they are packaged
and run so Phase 7 infrastructure work does not have to re-decide it.

## Decision

- `apps/web` is a single Next.js 16 application serving public, account, and
  admin routes plus the REST API (`/api/v1/**`) and `/health/live`,
  `/health/ready`, built with Turbopack, deployed as one container image.
- `apps/worker` is a plain Node.js process (no framework) that owns outbox
  polling/dispatch and scheduled tasks. It shares `packages/domain`,
  `packages/application`, and `packages/infrastructure` with `apps/web` but
  is built and deployed as a second, independent container image so it can
  scale, restart, and be rate-limited independently of request traffic.
- Both processes read configuration through the same
  `packages/infrastructure` env-schema loader (`loadEnv`) and implement
  graceful shutdown with a bounded timeout (`apps/worker/src/shutdown.ts`
  establishes the pattern) so in-flight HTTP requests and outbox jobs are not
  killed mid-transaction during a rolling deploy (§15.2, §15.3).
- Neither process talks to the other directly; all cross-process
  coordination happens through PostgreSQL (the transactional outbox) per
  §5.2/§13, never through a private HTTP call or shared in-memory state.

## Consequences

- Two container images and two deployment units must be built, versioned,
  and promoted together per release (§15.3 release flow), not one.
- The worker cannot render UI or serve HTTP; if a future requirement needs
  worker-originated HTTP (e.g. admin-triggered manual retry), it goes through
  `apps/web`'s API and an outbox/queue row, not a new worker endpoint.
- Local development requires running both processes; `pnpm --filter
@eramix/web dev` and `pnpm --filter @eramix/worker start` (once Phase 1
  gives the worker real work to do) are independent commands.
