#!/usr/bin/env bash
# Installs Playwright + browser binaries (Pi-only — the laptop session is
# explicitly forbidden from installing browser stacks) and runs the e2e/
# suite against a running demo stack. Run scripts/pi/04-production-build-
# and-demo.sh (or `pnpm --filter web run dev`) and scripts/pi/oidc-fake-
# idp.mjs first.
set -euo pipefail
cd "$(dirname "$0")/../.."

APP_URL="${APP_URL:-http://localhost:3000}"

echo "==> Confirming the app is up before installing anything"
curl -sf "${APP_URL}/health/live" > /dev/null \
  || { echo "FAIL: ${APP_URL}/health/live not reachable — start the app first."; exit 1; }

echo "==> Seeding E2E fixture users"
pnpm --filter @eramix/infrastructure run db:seed:e2e

echo "==> Installing e2e/ dependencies (isolated package, outside the pnpm workspace glob —"
echo "    see e2e/README.md for why) and Playwright's browser binaries"
(cd e2e && npm install && npx playwright install --with-deps chromium)

echo "==> Running the E2E suite"
(cd e2e && APP_URL="${APP_URL}" npx playwright test)

echo "PASS: browser E2E suite completed. Report: e2e/playwright-report/index.html"
