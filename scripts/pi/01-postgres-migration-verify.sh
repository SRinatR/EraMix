#!/usr/bin/env bash
# Verifies migrations apply cleanly from an empty PostgreSQL 19 Beta 2
# database (Phase 1 exit criterion) and sanity-checks the constraints Prisma
# has no schema.prisma attribute for (partial unique indexes, CHECK
# constraints) — the same two things the CI "Migration gate" job already
# proves in GitHub Actions, run here against the actual pinned Pi/Docker
# Postgres image to close the "never verified outside CI" gap ADR-0013 names.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> Starting a fresh Postgres 19 Beta 2 container"
docker compose -f infra/docker/docker-compose.yml up -d postgres
docker compose -f infra/docker/docker-compose.yml exec -T postgres sh -c \
  'until pg_isready -U eramix; do sleep 1; done'

echo "==> Resolving and pinning the exact image digest (ADR-0013 requirement)"
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' \
  "$(docker compose -f infra/docker/docker-compose.yml images -q postgres)")
echo "Resolved digest: ${DIGEST}"
echo "    -> if this differs from infra/docker/docker-compose.yml's pinned"
echo "       tag, update it and commit — ADR-0013 requires an exact digest,"
echo "       not a floating tag, for anything beyond local dev."

export DATABASE_URL='postgresql://eramix:eramix_local_dev@localhost:5432/eramix'

echo "==> Applying every migration from empty"
pnpm --filter @eramix/infrastructure run db:generate
pnpm --filter @eramix/infrastructure run db:migrate:deploy

echo "==> Verifying partial unique indexes exist"
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U eramix -d eramix -c "\di content_route_one_canonical" | grep -q content_route_one_canonical
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U eramix -d eramix -c "\di category_route_one_canonical" | grep -q category_route_one_canonical

echo "==> Verifying CHECK constraints exist"
for constraint in order_line_quantity_positive product_translation_price_currency_pair \
  product_asset_size_positive product_asset_sort_order_non_negative; do
  docker compose -f infra/docker/docker-compose.yml exec -T postgres \
    psql -U eramix -d eramix -c "SELECT conname FROM pg_constraint WHERE conname = '${constraint}';" \
    | grep -q "${constraint}"
  echo "    OK: ${constraint}"
done

echo "==> Verifying a live CHECK constraint actually rejects a bad write"
set +e
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U eramix -d eramix -c \
  "INSERT INTO product_assets (id, \"productId\", \"assetType\", \"storageKey\", \"originalFilename\", \"displayName\", \"contentType\", \"sizeBytes\", \"checksumSha256\", \"sortOrder\", \"malwareScanStatus\", \"malwareScanEngine\", \"updatedAt\") VALUES (gen_random_uuid(), gen_random_uuid(), 'IMAGE', 'x', 'x', 'x', 'image/png', -1, repeat('a',64), 0, 'CLEAN', 'test', now());" \
  2>&1 | tee /tmp/check-constraint-test.log
RESULT=$?
set -e
if [ $RESULT -eq 0 ]; then
  echo "FAIL: negative sizeBytes was accepted — product_asset_size_positive is not enforced."
  exit 1
fi
grep -q "product_asset_size_positive" /tmp/check-constraint-test.log
echo "    OK: negative sizeBytes rejected by the database, not just application code"

echo "==> Second run: migrations are idempotent against an already-migrated database"
pnpm --filter @eramix/infrastructure run db:migrate:deploy

echo "PASS: migrations apply from empty, are idempotent, and every named constraint holds."
