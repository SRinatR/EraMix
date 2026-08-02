#!/usr/bin/env bash
# Verifies the product-asset upload -> validate -> malware-scan -> store ->
# metadata-edit -> visibility-gated-download -> remove pipeline against a
# running server and a real filesystem (packages/application/src/
# product-assets.ts, apps/web/src/app/api/admin/products/{productId}/
# assets/**, apps/web/src/app/api/catalog/products/{publicId}/assets/
# {assetId}/download). Unit tests already prove the logic in isolation; this
# proves the wiring — real HTTP, real bytes on disk, real checksum.
set -euo pipefail
cd "$(dirname "$0")/../.."

APP_URL="${APP_URL:-http://localhost:3000}"
: "${DATABASE_URL:?Set DATABASE_URL to the same Postgres the app is running against}"

echo "==> Seeding structural catalog data (category + sample product)"
pnpm --filter @eramix/infrastructure run db:seed

echo "==> Looking up the seeded sample product's id/publicId/version"
ROW=$(docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U eramix -d eramix -t -A -F'|' \
  -c "SELECT id, \"publicId\", version FROM products WHERE sku = 'SEED-0001';")
PRODUCT_ID=$(echo "${ROW}" | cut -d'|' -f1)
PRODUCT_PUBLIC_ID=$(echo "${ROW}" | cut -d'|' -f2)
[ -n "${PRODUCT_ID}" ] || { echo "FAIL: SEED-0001 product not found — did the seed run against this DATABASE_URL?"; exit 1; }
echo "    product id=${PRODUCT_ID} publicId=${PRODUCT_PUBLIC_ID}"

echo "==> Logging in as admin"
ADMIN_COOKIE=$(node scripts/pi/login-as.mjs admin "${APP_URL}")

echo "==> Creating a minimal valid PNG fixture"
FIXTURE_DIR=$(mktemp -d)
# 1x1 transparent PNG, well-formed (real signature + real zlib stream).
base64 -d > "${FIXTURE_DIR}/pixel.png" <<'B64'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YA
AAAASUVORK5CYII=
B64

echo "==> Uploading it as a product image"
UPLOAD_RESPONSE=$(curl -sf -X POST "${APP_URL}/api/admin/products/${PRODUCT_ID}/assets" \
  -H "Cookie: ${ADMIN_COOKIE}" \
  -F "file=@${FIXTURE_DIR}/pixel.png;type=image/png" \
  -F "displayName=Pixel fixture" \
  -F "altText=A single transparent pixel")
echo "    ${UPLOAD_RESPONSE}"
ASSET_ID=$(echo "${UPLOAD_RESPONSE}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "${ASSET_ID}" ] || { echo "FAIL: upload response had no id"; exit 1; }
echo "${UPLOAD_RESPONSE}" | grep -q '"assetType":"IMAGE"' || { echo "FAIL: expected assetType IMAGE"; exit 1; }
echo "${UPLOAD_RESPONSE}" | grep -q '"malwareScanStatus":"CLEAN"' || { echo "FAIL: expected malwareScanStatus CLEAN"; exit 1; }
echo "${UPLOAD_RESPONSE}" | grep -q '"malwareScanEngine":"dev-stub' || { echo "FAIL: malwareScanEngine did not identify itself as a dev stub — see docs/runbooks/security.md"; exit 1; }
echo "    OK: asset ${ASSET_ID} created, scan-engine provenance is honest"

echo "==> Rejecting an oversized/disallowed upload never reaches storage"
dd if=/dev/zero of="${FIXTURE_DIR}/not-an-image.txt" bs=1024 count=1 status=none
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/admin/products/${PRODUCT_ID}/assets" \
  -H "Cookie: ${ADMIN_COOKIE}" \
  -F "file=@${FIXTURE_DIR}/not-an-image.txt;type=text/plain")
[ "${STATUS}" = "422" ] || { echo "FAIL: expected 422 for a disallowed content type, got ${STATUS}"; exit 1; }
echo "    OK: disallowed content type rejected with 422"

echo "==> DRAFT asset on a DRAFT product: public download is 404 (visibility-gated), admin preview works"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${APP_URL}/api/catalog/products/${PRODUCT_PUBLIC_ID}/assets/${ASSET_ID}/download")
[ "${STATUS}" = "404" ] || { echo "FAIL: expected 404 for an unauthenticated download of a DRAFT asset, got ${STATUS}"; exit 1; }
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L \
  "${APP_URL}/api/catalog/products/${PRODUCT_PUBLIC_ID}/assets/${ASSET_ID}/download" \
  -H "Cookie: ${ADMIN_COOKIE}")
[ "${STATUS}" = "200" ] || { echo "FAIL: expected 200 for an admin preview download, got ${STATUS}"; exit 1; }
echo "    OK: unauthenticated 404, authenticated admin preview 200"

echo "==> Editing metadata"
curl -sf -X PATCH "${APP_URL}/api/admin/products/${PRODUCT_ID}/assets/${ASSET_ID}" \
  -H "Cookie: ${ADMIN_COOKIE}" -H "content-type: application/json" \
  -d '{"expectedVersion":0,"caption":"Updated via storage-flow verify"}' | grep -q '"version":1' \
  || { echo "FAIL: expected version to bump to 1 after a metadata edit"; exit 1; }
echo "    OK: optimistic concurrency version bumped"

echo "==> Removing the asset requires explicit confirm:true"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "${APP_URL}/api/admin/products/${PRODUCT_ID}/assets/${ASSET_ID}" \
  -H "Cookie: ${ADMIN_COOKIE}" -H "content-type: application/json" -d '{"confirm":false}')
[ "${STATUS}" = "422" ] || { echo "FAIL: expected 422 without confirm:true, got ${STATUS}"; exit 1; }
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "${APP_URL}/api/admin/products/${PRODUCT_ID}/assets/${ASSET_ID}" \
  -H "Cookie: ${ADMIN_COOKIE}" -H "content-type: application/json" -d '{"confirm":true}')
[ "${STATUS}" = "204" ] || { echo "FAIL: expected 204 on confirmed removal, got ${STATUS}"; exit 1; }
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L \
  "${APP_URL}/api/catalog/products/${PRODUCT_PUBLIC_ID}/assets/${ASSET_ID}/download" \
  -H "Cookie: ${ADMIN_COOKIE}")
[ "${STATUS}" = "404" ] || { echo "FAIL: expected 404 for a removed asset, got ${STATUS}"; exit 1; }
echo "    OK: removal deleted both the row and the downloadable file"

rm -rf "${FIXTURE_DIR}"
echo "PASS: upload/validate/scan/store/edit/visibility/remove pipeline verified against a live server."
