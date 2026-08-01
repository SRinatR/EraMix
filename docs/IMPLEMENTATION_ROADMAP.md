# EraMix MVP — implementation roadmap

This is the execution plan for the CLI agent. Work phases in order. A phase is
complete only when its exit criteria and quality gates pass.

## Phase 0 — repository bootstrap and decisions

Deliver:

- Establish the pnpm TypeScript monorepo and the required application/package
  boundaries.
- Use Corepack with `pnpm@12.0.0-beta.2`; pin Next.js `16.2.12`, TypeScript
  `7.0.2`, and the exact resolved stable React/React DOM `19.2.x` patch.
- Pin Node.js `24.18.1` in `engines`, a repository runtime-version file, and CI.
- Add exact root devDependency `@types/node@24.13.3`, aligned to the Node 24
  runtime major; do not use Node 26 declarations against a Node 24 runtime.
- Before generating the workspace, validate availability and peer compatibility
  of every requested version. In particular, do not silently replace
  `next@16.2.12` if it is unavailable.
- Add strict TypeScript, formatting, linting, test tooling, environment schema,
  Docker development dependencies, and a CI skeleton.
- Create ADRs for ODS integration details, hosting/object storage/email provider,
  pricing model, and any deviation from the technical specification.
- Create an OpenAPI 3.2 source document and an RFC 9457 error catalogue.

Exit criteria:

- Clean clone passes install, format check, lint, typecheck, unit-test command,
  and production build.
- A clean-install CI job proves Corepack/pnpm 12 beta reproducibility and the
  committed lockfile resolves the approved version baseline.
- CI runs those checks without optional/failing gates.
- Repository boundaries prevent domain packages from importing framework or ORM
  code.

### Phase 0 status: bootstrap complete locally; CI unverified on a real runner

Evidence, 2026-08-01:

- **Resolved version baseline** (validated against the registry, not
  assumed): `node@24.18.1` (upgraded via `winget upgrade OpenJS.NodeJS.LTS`
  from the pre-installed `24.18.0`, since `24.18.1` is a real, newer Krypton
  LTS security patch), `pnpm@12.0.0-beta.2` (`next-12` dist-tag, activated
  via `corepack use`), `next@16.2.12`, `react@19.2.8` /
  `react-dom@19.2.8`, `typescript@7.0.2` (real compiler, used by every
  package's own `tsc -b`), `@types/node@24.13.3`. All exact, all committed in
  `package.json`/`pnpm-lock.yaml`, `.node-version`, `.nvmrc`.
- **Clean-clone simulation** (re-run after the ADR-0012 correction below):
  `node_modules`, `dist`, `.next`, and `*.tsbuildinfo` removed repo-wide, then
  `pnpm install --frozen-lockfile` (exit 0) → `pnpm run format` (exit 0) →
  `pnpm run lint` (exit 0) → `pnpm run typecheck` (exit 0) → `pnpm run test`
  (exit 0, 29 unit tests across 7 packages) → `pnpm run build` (exit 0,
  `next build` produces `/`, `/health/live`, `/health/ready`). `pnpm why
typescript -r` shows exactly one resolved version, `7.0.2`, across all 8
  workspace projects including root — no shim anywhere.
- **Repository boundary proof**: `packages/domain`/`packages/application`'s
  `no-restricted-imports` rule against `next`/`react`/`@prisma/client`/
  `openid-client` was implemented and verified working (temporarily adding
  `import next from 'next'` to `packages/domain/src/locale.ts` failed lint
  with `'next' import is restricted from being used by a pattern`), but is
  currently **suspended** — see the TypeScript 7 tooling entry below. The
  dependency-graph/`tsc -b` layer alone remains active and sufficient (an
  undeclared `next`/`react`/`@prisma/client` import in `packages/domain` or
  `packages/application` fails the build with "Cannot find module"). See
  ADR-0001.
- **pnpm 12 beta risk gate**: reproduced and root-caused a real local failure
  (`Failed to create symlink ... A required privilege is not held by the
client`) on Windows without Developer Mode; resolved by enabling Developer
  Mode (user action, `HKLM` write was denied to the agent) rather than
  silently downgrading the pin or permanently weakening isolation via
  `node-linker=hoisted`. See ADR-0011.
- **TypeScript 7 tooling gap — corrected approach**: `typescript-eslint@8.65.0`
  refuses to load against `typescript@7.0.2` (hard peer gate,
  `typescript: >=4.8.4 <6.1.0`); `next build`'s internal type-check pass also
  doesn't support TS 7's API. The first fix attempt aliased root
  `typescript` to a TS6 compatibility shim so `typescript-eslint` would load —
  **this was rejected as a policy violation** (no project may resolve
  `typescript` to anything but real `7.0.2`, root included) and reverted.
  The corrected fix: every `package.json` (root included) pins plain
  `"typescript": "7.0.2"`; `typescript-eslint` and all
  `@typescript-eslint/*` packages are removed from the dependency tree
  entirely; `eslint.config.js` globally ignores `**/*.ts`/`**/*.tsx`/
  `**/*.d.ts` (TypeScript-aware ESLint literally cannot parse those files
  without the plugin, so this is a hard requirement, not a preference).
  ESLint remains mandatory in every `lint` script (with
  `--no-error-on-unmatched-pattern`, since most packages are now 100%
  TypeScript and would otherwise report "no files matched") and still
  catches real violations in any `.js`/`.mjs`/`.cjs` file — verified live by
  injecting an unused variable into `eslint.config.js` itself and confirming
  ESLint reported it. `tsc -b` (strict, real TS 7, unaffected throughout)
  remains the mandatory type-safety gate for all `.ts` code. `next build`'s
  `experimental.useTypeScriptCli: true` was confirmed to invoke the real
  compiler once the tree-wide single-version check above passed. Full
  rationale, the exact reduced lint scope, and the re-enable trigger
  (typescript-eslint adding TS 7 support) are in ADR-0012.
- **OpenAPI 3.2 toolchain**: `@redocly/cli@2.43.2` lints
  `openapi: 3.2.0` directly with zero errors/warnings once `info.license` and
  the two justified rule exceptions are set — no 3.1.x compatibility artifact
  needed (resolves TZ §21 Q-07). See ADR-0004.
- **ADRs recorded**: 0001, 0002, 0004, 0010 (decided from the TZ),
  0011, 0012 (tooling risks found during bootstrap, not in the TZ), and
  0003/0005/0006/0007/0008/0009 (explicitly **blocked**, pending TZ §21
  Q-01/Q-03/Q-05/Q-06 business decisions — see `docs/OPEN_QUESTIONS.md`;
  no business value was invented for any of these).
- **Not yet verified — the one open exit-criterion item**: `.github/workflows/
ci.yml` exists and mirrors the local `check` sequence plus the
  `--frozen-lockfile` clean-install gate, but this repository has no `git`
  remote and nothing has been pushed, so **no real GitHub Actions run has
  executed it yet**. Local verification (above) is not a substitute for that;
  treat CI as configured-but-unproven until it runs once for real.

## Phase 1 — persistence, domain core, and migrations

Deliver:

- PostgreSQL and Prisma configuration with versioned migrations.
- PostgreSQL `19beta2` is mandatory for local, CI, staging, and initial
  production; pin its image digest and implement the ADR-0013 safeguards.
- Core aggregates: User, Company, Membership, Category, Product,
  ProductTranslation, Order, OrderLine, OrderStatusHistory, Article/Page/FAQ,
  ContentTranslation, route history, AuditEvent, and OutboxMessage.
- Constraints, indexes, optimistic concurrency/versioning, seed data, and
  repository adapters.
- Typed domain errors including validation, authorization, conflict, slug
  conflict, and missing canonical route cases.

Exit criteria:

- Migrations apply from an empty database and upgrade the preceding schema.
- Integration tests verify unique constraints, indexes, transaction rollback,
  optimistic concurrency, and audit/outbox atomicity.
- No combined `id-slug` column exists.

## Phase 2 — localized URLs, content foundation, and SEO

Deliver:

- Locale allowlist `ru`, `en`, `uz`, with `en` default and translation-aware
  content model. Configure `next-intl` with `localePrefix: 'always'` and
  `localeDetection: true` for unprefixed entry URLs.
- Route registry/history for article, page, and category; current and historical
  resolution with a one-hop `308` redirect.
- Immutable product `publicId` and localized product slugs.
- Slug normalization, reserved-slug validation, collision handling, explicit
  change-slug command, audit event, cache invalidation, and outbox event.
- Typed URL builder plus Next.js public routes, canonical metadata, hreflang,
  x-default, robots, sitemap, Open Graph, JSON-LD, and missing-locale handling.

Exit criteria:

- Tests cover current route, old-slug redirect, collision, no redirect chain,
  missing locale, unpublished content, product slug mismatch, and 404/410 cases.
- No public URL is composed manually outside the URL-builder package.
- Sitemap contains canonical published URLs only.

## Phase 3 — public website and catalog

Deliver:

- SSR/SEO public site: home, company information, certificates, instructions,
  FAQ, contacts, blog/article, 404 and 500 screens.
- Catalog browse, category hierarchy, search/filtering, product detail, media,
  documents, and product publication/archive lifecycle.
- Responsive, accessible UI with explicit loading, empty, validation, permission,
  and failure states.

Exit criteria:

- Public pages render without authentication and meet the documented SEO policy.
- Accessibility smoke tests cover keyboard navigation, focus, labels, errors,
  contrast, and reduced motion.
- Catalog tests verify only published content is exposed.

## Phase 4 — ODS identity, session, RBAC, and account

Deliver:

- OIDC Authorization Code + PKCE login/callback/logout implementation against
  the approved ODS contract.
- Secure local session and stable user mapping by `(issuer, subject)`.
- Permission model and server-side authorization policies.
- Account dashboard, profile/company views, onboarding/no-company state, and
  protected order/document access.

Exit criteria:

- OIDC tests cover successful login, invalid state/nonce/signature, expired
  token, unknown claims, callback failure, logout, and JWKS refresh.
- Negative permission tests prove that direct API calls cannot bypass RBAC.

## Phase 5 — ordering and notifications

Deliver:

- Draft order creation, line management, validation, submit idempotency, contact
  and delivery data, and authorized order views.
- State-machine transitions: DRAFT, SUBMITTED, UNDER_REVIEW,
  WAITING_CONFIRMATION, CONFIRMED, IN_PREPARATION,
  READY_FOR_PICKUP/READY_FOR_DELIVERY, COMPLETED, CANCELLED.
- Manager workflow, comments, status timeline, immutable order snapshots, audit
  events, transactional outbox, and notification worker.

Exit criteria:

- E2E verifies submit, duplicate Idempotency-Key behaviour, forbidden transitions,
  customer isolation, manager transition, and notification retry/dead-letter
  behaviour.
- Every status transition has a reason/actor/audit record where required.

## Phase 6 — administration, publishing, and media

Deliver:

- Admin dashboard and secured CRUD for catalog, content, media, users/roles,
  orders, publications, and audit search.
- Editorial translation workflow, preview URLs, explicit slug operation, route
  history visibility, and safe archive behaviour.
- Upload validation: allowlisted MIME/extensions, size/signature checks,
  malware scanning integration point, checksum, object-storage policy, and
  controlled download URLs.

Exit criteria:

- Admin E2E proves role-specific access and protected actions.
- Publication validates required SEO fields, canonical route, links, and slug
  uniqueness before it becomes public.

## Phase 7 — observability, security, infrastructure, and CI/CD

Deliver:

- OpenTelemetry SDK/OTLP Collector configuration, structured logs, traces,
  metrics, dashboards, alerts, health checks, and runbooks.
- Threat model, CSP/CSRF/rate limits, dependency/secret/container scans, SBOM,
  and secure container build.
- Environment configuration, immutable image build, migration gate, staging
  deployment, smoke tests, production promotion controls, backup/PITR plan,
  restore drill, and rollback/forward-fix procedure.
- Initial production uses PostgreSQL `19beta2` under ADR-0013. PostgreSQL 19 GA
  is a separate rehearsed, explicitly authorized upgrade after its release.

Exit criteria:

- Telemetry proves trace propagation from request through worker/outbox.
- Restore drill meets MVP RPO/RTO targets and is documented.
- CI blocks release on failing required gates; staging smoke and production
  promotion evidence are retained.

## Phase 8 — release acceptance

Deliver:

- Traceability matrix connecting every MUST requirement to implementation and
  evidence.
- UAT package, release notes, operational handover, and backlog of deferred work.

Exit criteria:

- All release-acceptance items from the technical specification have evidence.
- Product Owner signs UAT after green staging/production-like verification.

## Required task format for the CLI agent

For every task, report:

1. Active phase and requirement IDs.
2. Files inspected and intended change.
3. Implementation and any ADR/open question created.
4. Exact verification commands and their results.
5. Remaining risks or the next smallest task.

Do not advance to the next phase when an exit criterion is unmet.

## Failure-handling rule

Every failed command is evidence, not a prompt to bypass the gate. Preserve its
exit code and relevant error output, identify the root cause, and fix only the
underlying prerequisite or implementation defect. Never use force/ignore/skip
flags, disable assertions, replace required integrations with mocks, change
package-manager linker/hoisting settings to hide an install failure, or delete
user work to regain a clean state. A fallback is permitted only after an approved
ADR documents its impact, rollback, and verification.

## Approved temporary exception: TypeScript 7 and typescript-eslint

TypeScript `7.0.2` remains pinned. If the current stable `typescript-eslint`
release does not officially support TypeScript 7, retain strict `tsc --noEmit`,
tests, builds, formatting, and all non-TypeScript lint checks. Only the
TypeScript-specific ESLint parser/plugin integration may be disabled temporarily.
Create an ADR with upstream-version evidence, the exact lost rules, scope, owner,
and re-enable trigger. Do not downgrade TypeScript, hide the incompatibility, or
disable the complete lint/typecheck gate.
