# ADR-0013: PostgreSQL 19 Beta 2 for initial production

- Status: Accepted — explicit Product Owner risk acceptance; production
  safeguards verified 2026-08-08
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

## Evidence, 2026-08-08 (first production deployment, 94.232.41.16/eramix.uz)

- **Pinned digest**: `postgres@sha256:d37ce87b33b80bd76fb8d9bc9ff6ad2caaf6c4a50caf9ae25e393f247fc01d6e`
  — resolved on the production host itself (`docker pull` +
  `docker inspect`), recorded in `docs/runbooks/deploy.md`.
- **Migrations from empty**: all 13 migrations applied cleanly to a fresh
  volume via the `eramix-migrate` image — real evidence, not simulated.
- **Backup/restore drill** (`docs/runbooks/backup-restore.md`'s required
  drill, run for the first time against real production data):
  `pg_dump --format=custom` of the live production database (1s, 72KB),
  restored into a separate throwaway container/volume (1s) — never
  touching the production database itself. Integrity verified: category
  count, user count, and the seeded admin user's exact row (id, email,
  `platformRole`) all matched between source and restored copies.
- **Known issue found and fixed by this drill**: the pre-18 Docker volume
  mount convention (`.../postgresql/data`) is rejected by this 18+-series
  image at startup ("unused mount", restart-loop) — fixed to mount at
  `/var/lib/postgresql` directly in both `docker-compose.prod.yml` and the
  local-dev `docker-compose.yml` (the latter had the identical latent bug,
  now also fixed pre-emptively).
- **Not yet done**: RTO/RPO targets remain blocked on ADR-0008's Q-04 load
  forecast (unchanged); this evidence proves the mechanism works and its
  actual timing, not that the timing meets a target that doesn't exist yet.
  Beta release-note monitoring is an ongoing operational duty, not a
  one-time gate.
