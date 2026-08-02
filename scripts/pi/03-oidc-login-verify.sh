#!/usr/bin/env bash
# Verifies a real HTTP OIDC Authorization Code + PKCE round trip end to end
# for every fixture role (this phase's own exit criteria: "OIDC tests cover
# successful login... logout"), plus the negative cases that only make sense
# against a *live* server (a fake/tampered session cookie, no cookie at all).
set -euo pipefail
cd "$(dirname "$0")/../.."

APP_URL="${APP_URL:-http://localhost:3000}"

echo "==> Seeding fixture users (customer/manager/editor/admin/auditor)"
pnpm --filter @eramix/infrastructure run db:seed:e2e

echo "==> Confirming the fake IdP is reachable"
curl -sf "http://localhost:${E2E_OIDC_PORT:-9099}/.well-known/openid-configuration" > /dev/null \
  || { echo "FAIL: fake IdP not reachable — start it first: node scripts/pi/oidc-fake-idp.mjs"; exit 1; }

for role in customer manager editor admin auditor; do
  echo "==> Logging in as ${role}"
  COOKIE=$(node scripts/pi/login-as.mjs "${role}" "${APP_URL}")
  SESSION=$(curl -sf "${APP_URL}/api/auth/session" -H "Cookie: ${COOKIE}")
  echo "    session: ${SESSION}"
  EXPECTED_ROLE=$(echo "${role^^}" | sed 's/EDITOR/CONTENT_EDITOR/')
  echo "${SESSION}" | grep -q "\"platformRole\":\"${EXPECTED_ROLE}\"" \
    || { echo "FAIL: expected platformRole ${EXPECTED_ROLE} in session response"; exit 1; }
  echo "    OK: session reflects platformRole=${EXPECTED_ROLE}"

  echo "==> Logging out invalidates the session"
  curl -sf -X POST "${APP_URL}/api/auth/logout" -H "Cookie: ${COOKIE}" -o /dev/null
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/auth/session" -H "Cookie: ${COOKIE}")
  [ "${STATUS}" = "401" ] || { echo "FAIL: expected 401 after logout, got ${STATUS}"; exit 1; }
  echo "    OK: session rejected after logout (401)"
done

echo "==> No session cookie at all -> 401 on a protected endpoint"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/admin/users")
[ "${STATUS}" = "401" ] || { echo "FAIL: expected 401 with no session, got ${STATUS}"; exit 1; }
echo "    OK"

echo "==> Tampered session cookie -> 401, never 500"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/admin/users" \
  -H "Cookie: eramix_session=not-a-real-token")
[ "${STATUS}" = "401" ] || { echo "FAIL: expected 401 with a tampered cookie, got ${STATUS}"; exit 1; }
echo "    OK"

echo "==> RBAC boundary: a CUSTOMER session cannot reach an admin-only endpoint"
CUSTOMER_COOKIE=$(node scripts/pi/login-as.mjs customer "${APP_URL}")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/admin/users" -H "Cookie: ${CUSTOMER_COOKIE}")
[ "${STATUS}" = "403" ] || { echo "FAIL: expected 403 for CUSTOMER on /api/admin/users, got ${STATUS}"; exit 1; }
echo "    OK: CUSTOMER gets 403, not a hidden-UI-only restriction (IAM-008)"

echo "PASS: OIDC login/session/logout and RBAC boundary checks all hold against a live server."
