# ADR-0008: Hosting, PostgreSQL HA, and backup/PITR

- Status: Blocked — pending Q-06, Q-04
- Date: 2026-08-01
- Requirement source: TZ v1.1 §15.1, §19.1, Appendix D (ADR-008, "До
  staging"), §21 Q-04, Q-06

## Context

§19.1 requires a documented backup policy meeting MVP RPO/RTO targets, and
§15.1 requires distinct Local/CI/Development/Staging/Production environments.
Choosing a host and PostgreSQL HA/backup strategy without a load/data-volume
forecast (Q-04) risks over- or under-provisioning; the hosting provider
itself is also unchosen (Q-06).

## Decision

Not made. Blocked pending:

- A 12-month load/catalog-size forecast (Q-04) to size the database and
  choose managed vs. self-hosted PostgreSQL.
- A hosting provider decision (Q-06).

## Consequences

This ADR must be resolved before Phase 7 (infrastructure, staging
deployment, restore drill). Local development in the interim uses the
Postgres container in `infra/docker/docker-compose.yml` — that choice is
independent of this ADR and does not need to wait for it.
