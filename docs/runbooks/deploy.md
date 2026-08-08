# Runbook: production deployment (94.232.41.16 / eramix.uz)

Status: first real production deployment (2026-08-08). Supersedes the
"UNVERIFIED locally" caveats in `infra/docker/*.Dockerfile` and
`infra/docker/docker-compose.yml` for this host — those images have now been
built by CI and run for real.

## Topology

- Single VPS: Ubuntu 24.04, 1 vCPU, ~1GB RAM, 9.4GB disk, hostname `eramix`.
- DNS: `eramix.uz` A record → `94.232.41.16` (already configured externally
  before this deployment; not managed by this repo).
- `ufw`: only 22 (SSH), 80, 443 open to the public internet. `fail2ban` on
  sshd. `unattended-upgrades` enabled. 2GB swap file.
- Services run via `infra/docker/docker-compose.prod.yml` at `/opt/eramix`
  on the server: `postgres` (no host port — internal network only), `web`,
  `worker` (same), `caddy` (the only container publishing 80/443, terminates
  TLS via Let's Encrypt HTTP-01, reverse-proxies to `web:3000`).
- Images are built and pushed to GHCR by `.github/workflows/ci.yml`'s
  `docker-publish` job on every green push to `main`:
  `ghcr.io/srinatr/eramix-web:<sha>`, `ghcr.io/srinatr/eramix-worker:<sha>`,
  `ghcr.io/srinatr/eramix-migrate:<sha>`. The server never builds the
  monorepo itself (1GB RAM is not enough headroom for a Next.js/Turbopack
  production build).

## Pinned PostgreSQL 19 Beta 2 digest (ADR-0013)

Resolved 2026-08-08 on the production host itself (the "authorized
Docker-capable session" prior sessions were blocked on):

```
postgres@sha256:d37ce87b33b80bd76fb8d9bc9ff6ad2caaf6c4a50caf9ae25e393f247fc01d6e
```

`docker-compose.prod.yml` requires `POSTGRES_IMAGE` to be set to this exact
value (not `postgres:19beta2-alpine`, which is a floating tag) — set in
`/opt/eramix/.env` on the server.

## First-time deploy / redeploy

`/opt/eramix/` on the server holds `docker-compose.prod.yml`, `Caddyfile`
(copied from this repo's `infra/docker/`), `.env` (never committed —
production secrets only, see
`docs/runbooks/deploy.md#environment-variables` below), and `deploy.sh`:

```sh
#!/usr/bin/env bash
set -euxo pipefail
SHA="$1"
BASE="ghcr.io/srinatr"
cd /opt/eramix

export WEB_IMAGE="${BASE}/eramix-web:${SHA}"
export WORKER_IMAGE="${BASE}/eramix-worker:${SHA}"

# The host has only 9.4GB disk (2GB of which is swap) — not enough to hold
# two full generations of web+worker images plus the migrate image at once.
# Stop/remove the old web/worker containers first (brief downtime;
# postgres/caddy stay up) so their images become unreferenced and prunable
# before pulling the new generation, rather than risk running out of space
# mid-pull.
docker compose -f docker-compose.prod.yml stop web worker || true
docker compose -f docker-compose.prod.yml rm -f web worker || true
docker image prune -a -f

docker pull "${BASE}/eramix-migrate:${SHA}"

docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'until pg_isready -U "$POSTGRES_USER"; do sleep 1; done'

docker run --rm --env-file .env --network eramix_default \
  "${BASE}/eramix-migrate:${SHA}"

# Single-use, and by far the largest image (full devDependencies for prisma
# migrate deploy) — remove it immediately rather than let it compete with
# web/worker for disk.
docker rmi "${BASE}/eramix-migrate:${SHA}"

docker pull "${BASE}/eramix-web:${SHA}"
docker pull "${BASE}/eramix-worker:${SHA}"

docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps

docker image prune -a -f
```

Run it with the commit SHA to deploy (GHCR packages are public, so no
`docker login` is needed to pull):

```sh
bash /opt/eramix/deploy.sh <full-commit-sha>
```

Verify: `docker compose -f docker-compose.prod.yml ps`, then
`curl -f https://eramix.uz/health/ready`. **Note**: `web`/`worker` are
briefly unavailable during a redeploy (the disk constraint above requires
removing the old containers before the new images can be pulled) — this is
a known limitation of the current single-VPS, 9.4GB-disk deployment, not a
zero-downtime setup.

## Redeploy (new commit on main)

Re-run `deploy.sh` with the new commit SHA. `web`/`worker` have
`restart: unless-stopped`; `docker compose up -d` with a new `WEB_IMAGE`/
`WORKER_IMAGE` recreates only the containers whose image changed.

## Rollback

Re-run `deploy.sh` with the previous known-good commit SHA — GHCR keeps
every tagged image, so this never requires rebuilding anything. If the
rollback also needs a schema rollback, there is no automated down-migration
path
(consistent with Prisma's forward-only migration model); restore from the
most recent `pg_dump` per `docs/runbooks/backup-restore.md` instead.

## Environment variables (`/opt/eramix/.env`, never committed)

All variables from `.env.example`'s production-relevant section, with real
values: `DATABASE_URL`, `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`,
`POSTGRES_IMAGE` (the pinned digest above), `SESSION_SECRET`,
`PUBLIC_ORIGIN=https://eramix.uz`, `OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/
`OIDC_CLIENT_SECRET`/`OIDC_REDIRECT_URI` (ADR-0003), `R2_ACCOUNT_ID`/
`R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (ADR-0006). Rotate any
of these by editing `/opt/eramix/.env` and re-running `docker compose up -d`
(picks up the new `.env` on container recreation).

## Status and logs

```sh
docker compose -f /opt/eramix/docker-compose.prod.yml ps
docker compose -f /opt/eramix/docker-compose.prod.yml logs -f web
docker compose -f /opt/eramix/docker-compose.prod.yml logs -f worker
docker compose -f /opt/eramix/docker-compose.prod.yml logs -f caddy
docker compose -f /opt/eramix/docker-compose.prod.yml logs -f postgres
```

## Recovery after a server restart

`restart: unless-stopped` on every service plus `systemctl enable docker`
means the whole stack comes back automatically after a VPS reboot, in
dependency order (`depends_on: condition: service_healthy` for
`postgres`/`web`).
