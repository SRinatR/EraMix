# EraMix browser E2E suite (Pi-only)

This package is **deliberately outside the pnpm workspace**
(`pnpm-workspace.yaml` only globs `apps/*` and `packages/*`) so that nothing
in it is ever installed, linted, typechecked, or run by the root
`pnpm run check` / CI / the authoring laptop. It requires a real browser
(Playwright downloads Chromium) and a running server, neither of which are
permitted on the laptop per CLAUDE.md's laptop/Pi split.

**Nothing in this directory has been executed.** Every spec is written
against the real route/component names and behaviour as implemented and
verified by this repo's laptop-safe unit/contract tests and `next build`
route table, but a Playwright browser has never actually loaded any of these
pages. Treat selectors as "should work, first-run may need small fixes" —
proving that is exactly what running this suite for the first time on the
Pi is for.

## Prerequisites

1. A running server (either `pnpm --filter web run dev`, or the production
   Docker demo via `scripts/pi/04-production-build-and-demo.sh`).
2. `packages/infrastructure`'s E2E fixtures seeded:
   `pnpm --filter @eramix/infrastructure run db:seed` (structural) and
   `run db:seed:e2e` (test users + a fully PUBLISHED demo product — see that
   script's own comments for why a published-product fixture needs to bypass
   the normal authoring API).
3. `scripts/pi/oidc-fake-idp.mjs` running and the server's `OIDC_ISSUER_URL`
   pointed at it (see `scripts/pi/README.md`).

## Running

```sh
cd e2e
npm install
npx playwright install --with-deps chromium   # Pi-only — never on the laptop
APP_URL=http://localhost:3000 npx playwright test
```

Or just run `scripts/pi/05-browser-e2e-run.sh`, which does all of the above.

## What's covered

| File                           | Covers                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public-catalog.spec.ts`       | Locale detection/redirect/explicit-prefix-wins, canonical routes, 308 redirect on a stale product slug, 404s, robots/sitemap                                                           |
| `auth-rbac.spec.ts`            | Real OIDC login per role, server-side RBAC boundaries (never just hidden UI — IAM-008), logout                                                                                         |
| `ordering.spec.ts`             | Draft order creation, draft-editing UI, real Submit-order-button click, duplicate-Idempotency-Key no-op (via request replay), manager visibility, customer/company isolation (ORD-008) |
| `admin-product-assets.spec.ts` | Upload, the IMAGE-publish-requires-altText gate, public visibility after publish, confirm-gated removal                                                                                |
| `accessibility.spec.ts`        | axe-core WCAG 2.1 AA scan on key pages, keyboard navigation, `role="alert"` error announcement, `prefers-reduced-motion`                                                               |

## Known gaps and caveats (honest, not hidden)

- **Both gaps this section used to name are closed.** The account UI now has
  a real "Submit order" button (`submit-order-button.tsx`) that
  `ordering.spec.ts` drives via `helpers.ts`'s `submitOrderViaUi` — the
  duplicate-Idempotency-Key test replays the exact request that button sent
  (`replaySubmitRequest`) rather than fabricating a request from scratch, so
  it verifies a real network-retry scenario, not a UI-avoidance workaround.
  Category/product/content translations can now be edited in place
  (`updateCategoryTranslation`/`updateProductTranslation`/
  `updateContentTranslation`, `/admin/catalog` and `/admin/content`'s new
  "Edit translations" column) — `seed-e2e.ts`'s published demo product still
  seeds directly via Prisma, but only because fixed, upserted ids are the
  simpler choice for deterministic seed data, not because the endpoint is
  missing (see that file's own comment).
- **Test isolation.** Specs don't reset the database between runs; re-run
  `db:seed:e2e` (safe — it upserts) before re-running the suite if a prior
  run left extra product assets or orders behind. `admin-product-assets.spec.ts`
  is written to tolerate leftover rows (relative counts, first-row scoping);
  `ordering.spec.ts`'s idempotency test creates a fresh order every run, so
  it's naturally safe to repeat.
- **Selectors may need small fixes on first run** — see the warning above.
