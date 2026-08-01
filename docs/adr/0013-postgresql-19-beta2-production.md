# ADR-0013: PostgreSQL 19 Beta 2 for initial production

- Status: Accepted — explicit Product Owner risk acceptance
- Date: 2026-08-01

## Decision

Use PostgreSQL `19beta2` for local development, CI, staging, and the initial
production deployment. Pin the exact resolved container image digest. PostgreSQL
17/18 must not be substituted as a silent fallback.

## Mandatory safeguards

- Prisma migrations, bootstrap, integration tests, backup/restore, and disaster
  recovery rehearsal run against PostgreSQL 19 Beta 2.
- Production promotion requires successful backup/restore evidence, migration
  forward-fix/rollback plan, health and disk monitoring, and review of beta
  release notes/open regressions.
- PostgreSQL 19 GA upgrade is a separate, rehearsed production change planned
  after GA availability; it requires explicit deployment authorization and is
  never automatic.

## Risk

PostgreSQL Project does not recommend beta releases for production. This ADR is
an explicit accepted exception, reviewed at every release/incident gate.
