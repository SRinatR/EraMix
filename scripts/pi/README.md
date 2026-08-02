# Pi-session scripts and fixtures

Everything in this directory requires Docker, a real PostgreSQL 19 Beta 2
instance, and/or a browser — none of which are available or permitted on the
authoring laptop (CLAUDE.md's laptop/Pi split). Nothing here has been
executed against a live database, container, or browser; each script is
written to be deterministic and self-checking, but is **unverified** until
run once for real on the authorized Raspberry Pi (or another Docker-capable,
explicitly authorized) session.

Do not run any of these against a production or shared environment.

## Order of operations

```sh
# 0. From the repository root, with Docker available:
pnpm install --frozen-lockfile   # already verified in CI; repeat here for a clean local state

# 1. Bring up Postgres 19 Beta 2 and verify migrations apply from empty.
scripts/pi/01-postgres-migration-verify.sh

# 2. Start the app against that Postgres (dev mode is fine for 2/3; use the
#    production build + docker compose for step 4).
pnpm --filter web run dev &
pnpm --filter worker run dev &   # if a dev script exists; otherwise apps/worker/src/main.ts directly

# 3. Verify the upload/storage/malware-scan/signed-download pipeline against
#    a running server.
scripts/pi/02-storage-flow-verify.sh

# 4. Verify a real OIDC Authorization Code + PKCE round trip against the
#    fake IdP (seed the fixture users first).
pnpm --filter @eramix/infrastructure run db:seed:e2e
node scripts/pi/oidc-fake-idp.mjs 9099 &
scripts/pi/03-oidc-login-verify.sh

# 5. Build and run the production Docker images, smoke-test the stack.
scripts/pi/04-production-build-and-demo.sh

# 6. Install Playwright browsers (Pi-only — never on the laptop) and run the
#    E2E suite against the running demo stack.
scripts/pi/05-browser-e2e-run.sh
```

## Cleanup

```sh
docker compose -f infra/docker/docker-compose.yml down -v   # drops the named volume too
pkill -f "oidc-fake-idp.mjs"
rm -rf e2e/node_modules e2e/test-results e2e/playwright-report
```

## Files

| File                              | Verifies                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| `01-postgres-migration-verify.sh` | Migrations apply from empty against real Postgres 19 Beta 2      |
| `02-storage-flow-verify.sh`       | Upload → validate → scan → store → download round trip           |
| `oidc-fake-idp.mjs`               | Standalone fake OIDC IdP (zero dependencies, Node built-ins)     |
| `03-oidc-login-verify.sh`         | Real Authorization Code + PKCE login round trip via the fake IdP |
| `04-production-build-and-demo.sh` | Docker image build + compose up + health/smoke checks            |
| `05-browser-e2e-run.sh`           | Installs Playwright browsers, runs `e2e/` against the demo stack |

Everything downstream of Q-01 (real ODS issuer/claims) remains explicitly
blocked — the fake IdP proves the generic RFC 9700 + OIDC Core mechanics
work, not that ODS's specific claim contract is compatible; re-verify against
the real ODS issuer once Q-01 resolves (ADR-0003).
