# Runbook: PostgreSQL backup and restore (local/CI environment)

Status: covers the local `infra/docker/docker-compose.yml` Postgres
container only. Production backup policy (RPO/RTO targets, PITR, managed
vs. self-hosted) is **blocked on ADR-0008** (pending Q-04/Q-06) — this
runbook is not a substitute for that decision and must be revisited once
ADR-0008 resolves.

Untested on this authoring machine: no Docker available here (session
policy). Run through this runbook for the first time in the authorized
Docker-capable session before treating it as verified.

## Backup

```sh
# From the repository root, with the compose stack running:
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  pg_dump -U eramix -d eramix --format=custom --file=/tmp/eramix.dump
docker compose -f infra/docker/docker-compose.yml cp \
  postgres:/tmp/eramix.dump ./eramix-$(date +%Y%m%dT%H%M%S).dump
```

`--format=custom` produces a compressed, `pg_restore`-only archive (not
plain SQL) so schema/data can be restored selectively if needed.

## Restore (into a fresh database)

```sh
# Bring up an empty Postgres (or point at a new one), then:
docker compose -f infra/docker/docker-compose.yml cp \
  ./eramix-<timestamp>.dump postgres:/tmp/eramix.dump
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  pg_restore -U eramix -d eramix --clean --if-exists /tmp/eramix.dump
```

`--clean --if-exists` drops existing objects before recreating them, so
this is safe to run against a database that already has the schema applied
(e.g. via `prisma migrate deploy`) as well as a truly empty one.

## Restore drill (required before this runbook is considered verified)

1. Take a backup of a database with representative seed data
   (`prisma/seed.ts`).
2. Restore it into a _separate_, freshly-created database/container — never
   overwrite the source you just backed up from, to prove the backup file
   itself is sufficient.
3. Run `pnpm --filter @eramix/infrastructure run db:validate` and a smoke
   query (e.g. `SELECT count(*) FROM categories;`) against the restored
   database to confirm data integrity.
4. Record the elapsed time for both backup and restore — this is the actual
   RTO evidence Phase 7's exit criteria ("Restore drill meets MVP RPO/RTO
   targets") requires; MVP RPO/RTO _targets_ themselves are still blocked on
   ADR-0008's Q-04 load forecast, so there is nothing to compare the
   measured time against yet, but the drill and its timing should be run
   and recorded regardless.

## Migration gate (schema-only, no data)

`docker compose -f infra/docker/docker-compose.yml --profile migrate run --rm migrate`
runs `prisma migrate deploy` against the `postgres` service — this is the
"migrations apply from an empty database" exit criterion (Phase 1), not a
backup/restore operation. CI's `db-migration` job (`.github/workflows/ci.yml`)
runs the equivalent against a fresh `postgres:19beta2-alpine` service
container on every push.
