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

## First-time deploy

1. On the server, `/opt/eramix/` holds: `docker-compose.prod.yml`,
   `Caddyfile` (copied from this repo's `infra/docker/`), and `.env`
   (never committed — production secrets only, see
   `docs/runbooks/deploy.md#environment-variables` below).
2. Log in to GHCR and pull the images for the commit SHA being deployed:
   ```sh
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
   docker pull ghcr.io/srinatr/eramix-web:<sha>
   docker pull ghcr.io/srinatr/eramix-worker:<sha>
   docker pull ghcr.io/srinatr/eramix-migrate:<sha>
   ```
   (Unnecessary once the GHCR packages are set to public — then `docker
pull` needs no authentication.)
3. Run migrations as a one-off container, before starting web/worker:
   ```sh
   docker run --rm --env-file /opt/eramix/.env \
     --network eramix_default \
     ghcr.io/srinatr/eramix-migrate:<sha>
   ```
4. Start the stack:
   ```sh
   cd /opt/eramix
   WEB_IMAGE=ghcr.io/srinatr/eramix-web:<sha> \
   WORKER_IMAGE=ghcr.io/srinatr/eramix-worker:<sha> \
     docker compose -f docker-compose.prod.yml up -d
   ```
5. Verify: `docker compose -f docker-compose.prod.yml ps`, then
   `curl -f https://eramix.uz/health/ready`.

## Redeploy (new commit on main)

Same as steps 2-4 above with the new commit SHA. `web`/`worker` have
`restart: unless-stopped`; `docker compose up -d` with a new `WEB_IMAGE`/
`WORKER_IMAGE` recreates only the containers whose image changed.

## Rollback

Re-run step 2-4 with the previous known-good commit SHA — GHCR keeps every
tagged image, so this never requires rebuilding anything. If the rollback
also needs a schema rollback, there is no automated down-migration path
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
