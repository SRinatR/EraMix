#!/usr/bin/env bash
# Builds the production Docker images (infra/docker/web.Dockerfile,
# worker.Dockerfile), brings up the full stack (Postgres 19 Beta 2 + web +
# worker), runs the migration gate, and smoke-tests it — the "local demo
# deployment" Phase 7/8 exit criteria name. Explicitly local-only: never
# pushes an image anywhere, never touches a staging/production host.
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE="docker compose -f infra/docker/docker-compose.yml"

echo "==> Building web and worker images"
${COMPOSE} build web worker

echo "==> Starting Postgres and waiting for it to be healthy"
${COMPOSE} up -d postgres
${COMPOSE} exec -T postgres sh -c 'until pg_isready -U eramix; do sleep 1; done'

echo "==> Running the migration gate (one-off, profiled — never part of a default 'up')"
${COMPOSE} --profile migrate run --rm migrate

echo "==> Seeding structural demo data"
${COMPOSE} run --rm -e DATABASE_URL='postgresql://eramix:eramix_local_dev@postgres:5432/eramix' \
  web pnpm --filter @eramix/infrastructure run db:seed

echo "==> Starting web and worker"
${COMPOSE} up -d web worker

echo "==> Waiting for /health/live and /health/ready"
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health/live > /dev/null; then break; fi
  sleep 1
done
curl -sf http://localhost:3000/health/live | grep -q '"status":"ok"' \
  || { echo "FAIL: /health/live did not report ok"; exit 1; }
curl -sf http://localhost:3000/health/ready | grep -q '"status":"ok"' \
  || { echo "FAIL: /health/ready did not report ok (DB connectivity from the container?)"; exit 1; }
echo "    OK: liveness and readiness both green"

echo "==> Smoke-testing key public routes"
for path in / /en /en/catalog /en/faq /robots.txt /sitemap.xml; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000${path}")
  [ "${STATUS}" -lt 400 ] || { echo "FAIL: ${path} returned ${STATUS}"; exit 1; }
  echo "    OK: ${path} -> ${STATUS}"
done

echo "==> Confirming the app is genuinely running from the built image, not a dev server"
docker compose -f infra/docker/docker-compose.yml exec -T web sh -c 'echo $NODE_ENV' | grep -q production \
  || { echo "FAIL: NODE_ENV inside the web container is not production"; exit 1; }
echo "    OK"

echo "PASS: production images built, migrated, seeded, started, and smoke-tested locally."
echo "The stack is left running at http://localhost:3000 for scripts/pi/05-browser-e2e-run.sh."
echo "Tear down with: docker compose -f infra/docker/docker-compose.yml down -v"
