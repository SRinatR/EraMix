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

### Phase 1 status: schema/domain/repository layer built and laptop-verified; PostgreSQL integration unverified

Evidence, 2026-08-01:

- **ADR-0005 resolved**: hybrid indicative pricing (Product Owner decision).
  `OrderLine` carries no price/tax/total column (quote-only); `ProductTranslation`
  gets an optional, structured, non-binding `priceFromMinor`/`currency`/
  `priceMode`/`priceDisclaimer`, with a `CHECK` constraint tying currency to
  priceFromMinor. `docs/OPEN_QUESTIONS.md` Q-03 marked resolved.
- **New open item recorded, not invented**: Company's required legal/registration
  fields are still an unapproved business decision (TZ intro, not a numbered
  Q- item) — modeled as `Company.metadata: Json?` rather than fabricated
  structured columns; tracked as Q-09.
- **Prisma schema** (`packages/infrastructure/prisma/schema.prisma`): all
  Phase 1 aggregates — User, Company, Membership, Category/CategoryTranslation/
  CategoryRoute, Product/ProductTranslation, Content/ContentTranslation/
  ContentRoute (shared by Article/Page/FAQ — TZ Appendix F.3 explicitly allows
  either a per-type or a common typed registry; chose the latter since the
  three are structurally identical), Order/OrderLine/OrderStatusHistory,
  AuditEvent, OutboxMessage. `npx prisma validate` and `npx prisma generate`
  both pass (Prisma 7.9.1 — connection config now lives in `prisma.config.ts`,
  not `schema.prisma`; `PrismaClient` requires an explicit `@prisma/adapter-pg`
  driver adapter). No combined `id-slug` column anywhere; `publicId`/
  `orderNumber` are separate, immutable, domain-generated columns.
- **Domain layer** (`packages/domain`): all six remaining typed errors added
  (`AccessDeniedError`, `OrderStateConflictError`, `ConcurrencyConflictError`,
  `IdempotencyConflictError`, `SlugConflictError`, `CanonicalRouteMissingError`);
  value objects for `publicId`/`orderNumber` generation (Web Crypto
  `getRandomValues`, Crockford base32, no `@types/node`/framework dependency —
  kept consistent with the package's existing zero-platform-dependency
  convention), `quantity`, and the indicative-price invariant. Locale
  allowlist code fixed to match ADR-0010 (was still `ru/tt/en/uz`; is now
  `en/ru/uz`, `en` default — the doc/code drift predates this session).
- **Repository layer**: ports in `packages/application/src/repositories.ts`
  and Prisma adapters in `packages/infrastructure/src/repositories/*` for
  every Phase 1 aggregate (User, Company, Membership, Category, Product,
  Content, Order, AuditEvent, OutboxMessage), plus `PrismaUnitOfWork`
  (AsyncLocalStorage-based ambient transaction client) and
  `prisma-error-mapping.ts` (unique-constraint → `SlugConflictError`/
  `IdempotencyConflictError`, optimistic-lock-miss → `ConcurrencyConflictError`).
  `ContentRepository.setCanonicalRoute`/demoted-then-created pattern and
  `ProductRepository.updateStatus`'s `updateMany({ where: { id, version } })`
  are the concrete OCC/slug-conflict/canonical-route demonstrations named in
  this phase's exit criteria.
- **Migration**: `packages/infrastructure/prisma/migrations/20260801170000_init_phase1_schema/migration.sql`
  — the table/enum/index/FK portion is tool-generated
  (`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
  fully offline, no live database needed), with four manual additions Prisma
  has no `schema.prisma` attribute for: two partial unique indexes
  (`content_route_one_canonical`, `category_route_one_canonical` — exactly one
  canonical route per translation) and two `CHECK` constraints
  (`order_line_quantity_positive`, `product_translation_price_currency_pair`).
  `prisma/seed.ts` seeds only structural catalog data (one category, one
  product) — no User/Company/Order seed data, since that would need either
  real ODS claims (Q-01, still open) or invented business data.
- **Laptop-safe verification** (`pnpm run check`: format, lint, typecheck,
  test, build) — exit 0, **79 unit tests** across 8 workspace packages/apps,
  `next build` unaffected.
- **Not yet verified — the exit criteria this status block cannot claim**:
  nothing above has touched a real PostgreSQL instance. Whether the migration
  actually applies cleanly to an empty PostgreSQL 19 Beta 2 database, whether
  the partial unique indexes and `CHECK` constraints behave as intended,
  whether the optimistic-concurrency/unique-constraint-mapping code paths
  behave correctly against real Postgres error codes, and whether transaction
  rollback/audit-outbox atomicity hold under `PrismaUnitOfWork` are all
  **unverified**. Per CLAUDE.md, PostgreSQL integration testing runs on the
  Raspberry Pi, not this laptop; this is pending Pi SSH access (the user
  opted for key-based auth, to be set up separately) and the PostgreSQL
  19 Beta 2 image digest is likewise not yet resolved/pinned in
  `infra/docker/docker-compose.yml` (tag `postgres:19beta2-alpine` is set;
  the exact digest needs `docker pull`/`docker inspect` on the Pi).
  Do not treat this status block as Phase 1 completion — it is not.

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

### Phase 2 status: routing/domain/application layer built and dev-server-verified; PostgreSQL-backed pages and full SEO metadata not yet built

Evidence, 2026-08-01 (continued from the Phase 1 session; PostgreSQL integration
gate explicitly kept pending per Product Owner instruction — no Pi SSH/Docker/
Postgres work was attempted in this session):

- **Slug normalization** (`packages/domain/src/slug.ts`): deny-by-default
  `^[a-z0-9]+(?:-[a-z0-9]+)*$` allowlist, which is what actually rejects every
  CLAUDE.md-named category (empty, control characters, path separators,
  query/fragment characters, dot segments, percent-encoding) in one rule
  rather than a denylist that's easy to leave a gap in, plus a reserved-slug
  set covering TZ Appendix F.2's system routes and CLAUDE.md's technical
  route segments (`articles`, `pages`, `catalog`, `account`, `orders`, ...).
- **Typed URL builder** (`packages/domain/src/url-builder.ts`): `articleUrl`,
  `pageUrl`, `categoryUrl`, `productUrl`, `orderUrl` matching CLAUDE.md's
  canonical URL table exactly; each asserts its slug/publicId/orderNumber
  argument is already normalized/valid rather than silently re-normalizing
  it. Placed in `packages/domain` (not a new package) — pure zero-dependency
  policy code every layer already depends on; a dedicated package would need
  its own ADR for no behavioural difference.
- **Route resolution use cases** (`packages/application/src/route-resolution.ts`):
  `resolveContentRoute`, `resolveCategoryRoute`, `resolveProductRoute` —
  canonical/redirect/not-found decisions, always one hop (a historical route
  looks up the _current_ canonical route directly; once
  `*Repository.setCanonicalRoute` demotes a route it is never re-promoted, so
  chains are structurally impossible, not just tested-against). Unpublished
  content/category/product and a missing translation for the requested
  locale both resolve as not-found. 26 unit tests exercise every named exit
  criterion (current route, old-slug redirect spanning three slug
  generations, collision, missing locale, unpublished content, product slug
  mismatch, 404s, and a data-integrity guard for an orphaned canonical
  route) against in-memory fakes of the repository ports — **this verifies
  the resolution algorithm only, not `PrismaContentRepository`/
  `PrismaProductRepository` themselves, which remain gated on the pending
  PostgreSQL integration session.**
- **`next-intl` wired into `apps/web`**: `localePrefix: 'always'`,
  `localeDetection: true` (`src/i18n/routing.ts`, locales/default sourced
  from `packages/domain`), `src/proxy.ts` (Next.js 16 renamed
  `middleware.ts` → `proxy.ts` — confirmed against Next.js's own docs, not
  assumed), `app/[locale]/layout.tsx` + `page.tsx` with `notFound()` for an
  unsupported locale, `/health/*` routes deliberately left unprefixed and
  outside the proxy matcher. **Actually run and curl-tested against the dev
  server** (not just `next build`), per the project's UI-verification
  policy:
  - `GET /` with no `Accept-Language` → `307` to `/en`; with
    `Accept-Language: ru` → `307` to `/ru`; with `Accept-Language: uz` →
    `307` to `/uz`.
  - `GET /uz` with `Accept-Language: ru` still `200`s on `/uz` — explicit
    prefix wins over detection.
  - `curl -L` from `/` shows exactly one redirect hop, not a chain.
  - `GET /en`, `/ru`, `/uz` render the correct `lang` attribute and
    correct-locale content; `GET /fr` (unsupported) → `404`.
  - `GET /health/live`, `/health/ready` unaffected (still unprefixed `200`).
  - First attempt placed `proxy.ts` at the app root and it was silently
    never invoked (`/` 404'd instead of redirecting) — Next.js requires
    `proxy.ts` at the same level as `app/` when a `src/` directory is used,
    not the package root; moving it to `src/proxy.ts` fixed it, confirmed by
    `next build` now printing `ƒ Proxy (Middleware)`, which it did not
    before the fix.
- **Laptop-safe verification** (`pnpm run check`) — exit 0, **173 unit
  tests** across 8 workspace packages/apps (130 domain + 26 application + 8
  infrastructure + 2 contracts + 2 ui + 1 web + 4 worker; up from Phase 1's
  79), `next build` unaffected, plus the manual dev-server curl verification
  above.
- **Not yet built**: `CategoryRepository`/`ContentRepository`/
  `ProductRepository`-backed public pages (Phase 3 territory per the
  roadmap's own phase split), canonical `generateMetadata`/hreflang/
  x-default, `robots.txt`/`sitemap.xml`, Open Graph/JSON-LD, and the
  explicit "change slug" editorial command (Phase 2's `setCanonicalRoute`
  repository primitive exists; the use case/audit-event/outbox-event wiring
  around it does not yet). No public content page has been wired to a real
  repository adapter, so "Sitemap contains canonical published URLs only"
  and "product slug mismatch" against **real data** remain unverified along
  with everything else gated on PostgreSQL.
  Do not treat this status block as Phase 2 completion — it is not.

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

### Phase 3 status: catalog/content pages and API wired to real repositories; not statically prerendered, unauthenticated by design; accessibility/visual polish and media/documents not yet built

Evidence, 2026-08-01:

- **Public pages** (`apps/web/src/app/[locale]/`): `catalog` (category
  index), `catalog/[slug]` (disambiguates category vs. product by the
  `{publicId}-{slug}` shape — `packages/domain`'s `PUBLIC_ID_LENGTH`/
  `isValidPublicId`, redirects via `resolveCategoryRoute`/
  `resolveProductRoute`), `articles`, `articles/[slug]`, `pages/[slug]`,
  `faq` (FAQ has no per-item route — `ContentRouteNamespace` only covers
  `ARTICLES`/`PAGES`, so it is a single listing page, not invented per-item
  URLs). All call `getContainer()`'s real `PrismaCategoryRepository`/
  `PrismaProductRepository`/`PrismaContentRepository`, not fakes, and are
  marked `export const dynamic = 'force-dynamic'` so `next build` never
  needs a live database.
- **API mirrors the same use cases**: `GET /api/catalog/categories`,
  `/api/catalog/products` (the rate-limited search endpoint), `/api/catalog/
products/{publicId}`, `/api/content/{type}` — all public (`security: []`
  in the OpenAPI contract), all only ever return `PUBLISHED` items (the
  application-layer `listCatalogCategories`/`listCatalogProducts`/
  `listContentByType` queries filter by status at the repository layer, not
  the delivery layer).
- **Not yet built**: company information/certificates/instructions/contacts
  pages (no such `Content`/`ContentType` beyond `ARTICLE`/`PAGE`/
  `FAQ_ITEM` exists to back them — would need a product decision on
  whether they're `PAGE`s or a new type, not invented here), product
  media/document attachments (Phase 6 upload plumbing exists —
  `packages/domain/src/upload-validation.ts`, `POST /api/media` — but no
  `ProductAsset`-style association table or gallery UI), and any
  accessibility-specific smoke test (keyboard nav/contrast/reduced-motion) —
  the current pages are plain semantic HTML with no dedicated a11y test
  pass. **Nothing here has touched a real PostgreSQL instance on this
  laptop**; see the CI/Pi verification notes under Phase 7.
  Do not treat this status block as Phase 3 completion — it is not.

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

### Phase 4 status: generic OIDC PKCE flow + RBAC engine built and unit-verified against a real JWKS/signature stack; ODS-specific claim mapping remains blocked; account/profile UI not yet built

Evidence, 2026-08-01:

- **ADR-0014 (new, grounded in TZ §3.1's RBAC matrix, not invented)**: adds
  `PlatformRole` (`CUSTOMER`/`MANAGER`/`CONTENT_EDITOR`/`ADMIN`/`AUDITOR`) to
  `User`, migration `20260801180000_add_platform_role`.
  `packages/application/src/authorization.ts` transcribes TZ §3.1 table 8's
  resource×role matrix directly into `hasPermission`/`requirePermission`/
  `assertOrderCompanyAccess` — 15 unit tests including the exact ORD-008
  ("клиент видит только... заказы своей компании") boundary.
- **Generic OIDC Authorization Code + PKCE** (`packages/infrastructure/src/
oidc/`): `OidcIdentityProvider` implements the application-layer
  `IdentityProvider` port using `.well-known/openid-configuration`
  discovery, PKCE S256, and `jose`'s JWKS verification (issuer/audience/
  signature/expiry). No ODS-specific issuer URL, endpoint, or claim name is
  hardcoded anywhere — ADR-0003/Q-01 remain explicitly blocked, exactly per
  that ADR's instruction not to implement against invented ODS values.
  Verified against a **locally-generated RSA key pair and a fake IdP fetch
  double** (no network, no ODS): successful callback with a
  properly-signed token; rejected on state mismatch (CSRF), nonce mismatch
  (replay), and a token signed by a key absent from the serving JWKS
  (forged signature) — 7 tests. Session is a stateless, signed
  (`SessionCodec`) HttpOnly cookie carrying only `{userId, platformRole,
companyIds}`, never the raw OIDC tokens (CLAUDE.md: "Browser JavaScript
  must not access access or refresh tokens").
- **Server-side enforcement (IAM-008)**: every protected route handler
  (`apps/web/src/app/api/**`) calls `requireActor`/`requirePermission`
  before doing anything else; verified live (dev server, no session
  cookie) that `POST /api/media` and `GET /api/orders` both 401 rather
  than 200.
- **Not yet built**: `/auth/login`→ODS redirect has never been exercised
  against a real IdP (no ODS test tenant — Q-01), account dashboard/
  profile/company views, onboarding/no-company state UI, and the OIDC
  JWKS-rotation/expired-token/unknown-claims negative tests this phase's
  own exit criteria name are only proven against the fake IdP double, not
  a real ODS instance (cannot be, until Q-01 resolves).
  Do not treat this status block as Phase 4 completion — it is not.

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

### Phase 5 status: order lifecycle, state machine, and outbox notification worker built and unit-verified; no E2E (browser-driven) tests, real Postgres unverified on this laptop

Evidence, 2026-08-01:

- **State machine** (`packages/application/src/order-lifecycle.ts`):
  `ALLOWED_ORDER_TRANSITIONS` implements the roadmap's own named sequence
  (DRAFT→SUBMITTED→UNDER_REVIEW→WAITING_CONFIRMATION→CONFIRMED→
  IN_PREPARATION→READY_FOR_PICKUP|READY_FOR_DELIVERY→COMPLETED), CANCELLED
  reachable from every non-terminal state; ORD-006 (no direct line edits
  once SUBMITTED), ORD-007 (state machine + role + version + required
  data), ORD-008 (company isolation), ORD-010 (customer cancellation only
  pre-CONFIRMED; manager-only + reason required after) are each a named,
  passing test, including the literal TZ wording ("недопустимый переход
  возвращает RFC 9457 conflict").
- **Idempotent submit**: `submitOrder` treats a replayed Idempotency-Key
  against the same order as a no-op (returns the existing order, no second
  transition/outbox event) and a reused key against a _different_ order as
  `IdempotencyConflictError` — both are dedicated tests. Delivery layer
  (`POST /api/orders/by-id/{orderId}/submit`) requires the header and
  rate-limits the endpoint per CLAUDE.md's named "order submission" surface.
- **Transactional outbox + notification worker**: `apps/worker/src/
outbox-worker.ts`'s `processOutboxBatch` claims `PENDING`-or-backed-off-
  `FAILED` messages, dispatches via the `EmailSender` port, exponential
  backoff on failure, `DEAD_LETTER` after `MAX_OUTBOX_ATTEMPTS` (5) with no
  further retry — 4 tests including the dead-letter-never-reclaimed case.
  **Found and fixed a real pre-existing bug while building this**:
  `PrismaOutboxMessageRepository.claimPending` only matched
  `status: 'PENDING'`, so a message that had ever failed once could never
  be retried again regardless of its backoff `availableAt` — now matches
  `PENDING` or `FAILED`.
- **Not yet built**: no E2E/browser-driven test exists anywhere in this
  repo (Phase 8's traceability matrix will need to name this gap
  explicitly); the notification worker's `DevEmailSender` only logs
  recipient/subject to structured JSON, it does not send real mail (ADR-0007
  blocked on Q-06); manager comments/status-timeline UI does not exist (the
  `order.transition` API + audit trail exist, but no admin page renders
  them yet — see Phase 6). **No test in this phase has run against a real
  PostgreSQL instance on this laptop** — `packages/application`'s tests use
  in-memory fakes; `packages/infrastructure/src/repositories/
postgres.integration.test.ts` (new this session) exercises the real Prisma
  adapters but only runs where `DATABASE_URL` points at a live, migrated
  Postgres — see the CI/Pi verification section under Phase 7.
  Do not treat this status block as Phase 5 completion — it is not.

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
