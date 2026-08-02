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
- **Update, 2026-08-02 (Phase 6 session)**: TZ §6.1 WEB-003 ("Разделы «О
  компании», «Сертификаты», «Инструкции», FAQ, блог и контакты управляются
  из admin без релиза кода") does not require a new `ContentType` — the
  existing `PAGE` type plus its existing `/{locale}/pages/{localizedSlug}`
  route already satisfy "admin-managed, no code release," and Phase 6's new
  `/admin/content/new` authoring UI (see that phase's status block) can now
  create a `PAGE` with any editorial slug (e.g. `about`, `certificates`,
  `instructions`, `contacts`) end to end without a code change. This is a
  conservative default the existing specification already permits (CLAUDE.md:
  "Resolve non-blocking open questions conservatively only when the existing
  specification already permits a default"), not a new product decision —
  no such pages have actually been authored yet (that is editorial content
  work, not implementation), and there is still no dedicated main-navigation
  entry pointing at them (a site-structure/IA decision, not invented here).
  Also fixed in the same session: `ContentTranslation.content` (the article/
  page/FAQ body) was stored but never rendered on any public page — see
  Phase 6's status block for `content-body.tsx`.
- **Not yet built**: a main-navigation entry for company/certificates/
  instructions/contacts pages once authored (site-structure decision), product
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
- **Update, 2026-08-02 (Phase 8-prep session)**: found and fixed a real bug
  while preparing the Pi browser-E2E fixtures — both the pending-auth and
  session cookies (`apps/web/src/app/api/auth/login/route.ts`,
  `.../callback/route.ts`) hardcoded `secure: true` unconditionally. A
  `Secure` cookie is silently dropped by every real browser when the page
  isn't actually served over HTTPS — which a local Docker demo deployment on
  the Pi (Phase 7/8's own named exit criterion) legitimately is not, by
  default. Would have made the entire login flow appear to redirect
  successfully while silently never establishing a session — exactly the
  kind of failure `curl` (used for all prior "verified live" claims in this
  document) cannot catch, since curl doesn't enforce `Secure` the way a
  browser does; only a real browser-driven check surfaces it. Fixed with
  `apps/web/src/server/request-protocol.ts`'s `isSecureRequest` (checks
  `x-forwarded-proto` first, for a TLS-terminating reverse proxy, then falls
  back to the request's own scheme) — 5 new unit tests. Also added
  `scripts/pi/oidc-fake-idp.mjs`: a zero-dependency (Node built-ins only)
  standalone OIDC Authorization Code + PKCE identity provider implementing
  real discovery/authorize/token/JWKS endpoints against fixed test
  identities, wire-compatible with `OidcIdentityProvider` (verified locally
  via a live curl-driven PKCE round trip — real RS256 signature, real JWKS,
  single-use authorization codes, PKCE `code_verifier` mismatch rejected —
  see the roadmap's own verification note; this is a test double for the
  identity _provider_, not a substitute for the real ODS issuer once Q-01
  resolves). `packages/infrastructure/prisma/seed-e2e.ts` (new, Pi-only,
  never wired into `db:seed`/CI/deployment) seeds fixed
  CUSTOMER/MANAGER/CONTENT_EDITOR/ADMIN/AUDITOR users matching the fake
  IdP's identities, since first-login always creates a CUSTOMER
  (`apps/web/src/app/api/auth/callback/route.ts`) and there is deliberately
  no bootstrap-admin mechanism (ADR-0014) — an E2E suite exercising the
  other roles needs these rows to pre-exist.
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
- **Update, 2026-08-02 (Phase 8-prep session)**: `e2e/specs/ordering.spec.ts`
  now exists (Playwright, Pi-only — see Phase 8's status block) covering
  submit, duplicate-Idempotency-Key no-op, manager visibility of a submitted
  order, and customer/company isolation (ORD-008) named directly in this
  phase's own exit criteria — written, not yet executed (no browser on this
  laptop). It documents, rather than works around, a real gap found while
  writing it: the account UI has no "Submit order" button yet (only create +
  cancel), so the spec calls `POST /api/orders/by-id/{orderId}/submit`
  directly with the browser's session cookie — see that spec's own comment.
- **Update, 2026-08-02 (continued session): closes the customer order
  submission UI gap the previous update named.** The order-detail page
  (`apps/web/src/app/[locale]/account/orders/[orderNumber]/page.tsx`) now
  renders a real `SubmitOrderButton`
  (`.../[orderNumber]/submit-order-button.tsx`) — a client component that
  generates an `Idempotency-Key` via `crypto.randomUUID()` once per mount,
  sends it with the submit `POST`, and asks for confirmation
  (`window.confirm`) before submitting, since submission locks further line
  edits (ORD-006). It only renders while `actor.companyIds.includes(order.
companyId) && order.status === 'DRAFT' && order.lines.length > 0` — the same
  company-membership guard `submitOrder`/`addOrderLine`/`removeOrderLine`
  (`packages/application/src/order-lifecycle.ts`, unchanged this session)
  already enforce server-side. The page also gained draft-editing UI that
  did not exist before: `AddLineForm` (product/quantity/comment, POST to the
  existing `lines` route) and a `RemoveLineButton` per line
  (`window.confirm`-gated, DELETE) — the latter needed a genuinely new route,
  `DELETE /api/orders/by-id/{orderId}/lines/{lineId}`
  (`apps/web/src/app/api/orders/by-id/[orderId]/lines/[lineId]/route.ts`),
  since `removeOrderLine` existed in the application layer since Phase 5 but
  had no route handler until now (documented in OpenAPI as
  `removeOrderLine`/`RemoveOrderLineRequest`). Both the order-detail add-line
  picker and the pre-existing `/account/orders/new` create-order picker now
  show each product's non-binding indicative price inline (`apps/web/src/
components/indicative-price.tsx`'s `formatIndicativePrice`, e.g. "from 150.00
  USD (non-binding, indicative only)") when `ProductTranslation.
indicativePrice` is set — sourced directly from the read model, never
  computed into an order total, since `OrderLine` still carries no price
  field at all (ADR-0005) and no UI anywhere sums lines into a payable
  amount. `create-order-form.tsx` also gained per-line comment inputs
  (mapped to the existing `OrderLine.note` field, previously write-only from
  the API's perspective — the UI never exposed it) and optional
  contactName/contactPhone/contactEmail inputs (`CreateOrderRequest` already
  accepted these; the UI never surfaced them). `e2e/specs/ordering.spec.ts`
  (Pi-only, still unexecuted on this laptop — see Phase 8) now drives the
  real `SubmitOrderButton` via a new `submitOrderViaUi` helper instead of
  calling `POST .../submit` directly; the duplicate-Idempotency-Key
  assertion replays the exact request the button sent
  (`replaySubmitRequest`) to verify the server-side no-op behaviour a real
  network retry would exercise, rather than fabricating a same-shape request
  as a stand-in for the customer journey. **Verified locally** (laptop, no
  Postgres/browser): `pnpm run check` (format, lint incl. `redocly lint`,
  typecheck, test, build) exit 0 — 234 unit tests (up from 221), `next
build` registers 66 top-level route entries including the new `DELETE
/api/orders/by-id/{orderId}/lines/{lineId}` route. The e2e spec file was
  parse-checked with this workspace's own `esbuild` binary (zero syntax
  errors), same convention as every other Pi-only spec — a real Playwright
  run remains Pi-pending.
- **Not yet built**: the notification worker's `DevEmailSender` only logs
  recipient/subject to structured JSON, it does not send real mail (ADR-0007
  blocked on Q-06). Manager comments/status-timeline UI — see the
  "post-Phase-8 completeness pass" section near the end of this document,
  which closes this gap. **No test in this phase has run against a real
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

### Phase 6 status: users/roles, publication workflow, status-transition admin CRUD, catalog/content authoring (create + add-translation + explicit slug-change), upload/media pipeline, and audit search UI are built

Evidence, 2026-08-02 (continued session):

- **Users/roles** (TZ §3.1 "Пользователи и роли: CRUD" — Admin only):
  `GET /api/admin/users`, `PATCH /api/admin/users/{userId}/role` both
  `requirePermission(actor.platformRole, 'users.manage')` (only `ADMIN`
  holds it per `authorization.ts`), rate-limited, audit-logged
  (`user.platform_role_changed` with before/after role). UI at
  `/admin/users`.
- **Publication workflow** (`packages/application/src/publication.ts`,
  12 unit tests) — the exit criterion this phase names: `transition
CategoryStatus`/`transitionContentStatus`/`transitionProductStatus`
  each require the resource-appropriate permission (`catalog.write` for
  Category/Product, `content.write` for Content), then, only when the
  target status is `PUBLISHED`, verify every existing translation has
  `seoTitle`, `seoDescription`, and (Category/Content) a canonical route,
  or (Product) a non-empty `slug` — throwing `ValidationFailedError`
  (422) otherwise. Transitions to `DRAFT`/`ARCHIVED` are never gated (an
  editor must always be able to unpublish). Each transition runs in one
  `UnitOfWork` transaction with the `updateStatus` optimistic-concurrency
  write (new `CategoryRepository.updateStatus`/`ContentRepository.
updateStatus` — mirroring the pre-existing `ProductRepository.
updateStatus` — both throw `ConcurrencyConflictError`/409 on a stale
  `expectedVersion`), an audit record (`category.status_changed`/
  `content.status_changed`/`product.status_changed` with before/after
  status), and an outbox message, exactly like `changeContentSlug`/
  `changeCategorySlug` (Phase 2). Wired to `PATCH /api/admin/categories/
{categoryId}/status`, `PATCH /api/admin/content/{contentId}/status`,
  `PATCH /api/admin/products/{productId}/status` (all rate-limited,
  `requireActor`-gated, documented in `packages/contracts/openapi/
openapi.yaml`) and to a shared `TransitionStatusForm` client component
  used by the new `/admin/catalog` (categories + products) and
  `/admin/content` admin pages. `CategoryRepository`/`ContentRepository`/
  `ProductRepository` each gained a `listAll()` method (all statuses, no
  pagination — small MVP volume, same pattern as `UserRepository.
listAll`) so these admin pages can show DRAFT/ARCHIVED items, not only
  what the public `listPublished` methods expose.
- **Audit search UI**: `GET /api/admin/audit?entityType=&entityId=`
  (`audit.read.limited` or `audit.read.full`) wraps the existing
  `AuditEventRepository.listByEntity` — entity-scoped search only, there
  is still no list-everything method — and a plain-HTML-form
  `/admin/audit` Server Component page (no client JS needed) renders the
  results table.
- **Upload validation + media pipeline** (`packages/domain/src/
upload-validation.ts`, `packages/application/src/uploads.ts`): allowlisted
  MIME/extension/magic-byte-signature checks for jpeg/png/webp/pdf, a
  10 MB size ceiling, a required `MalwareScanner` port call before a file
  ever reaches storage (never optional — a failed scan or failed
  validation never calls `storage.put`), and a generated (never the raw
  user-supplied) storage key. `POST /api/media` (content.write permission)
  and `GET /api/media/download` (HMAC-signed, expiring URL, verified
  before the file is ever read from disk) — 20 tests across the domain/
  application/infrastructure layers, including a renamed-executable-with-
  spoofed-Content-Type rejection and a path-traversal-filename
  sanitization check. The concrete object-storage provider and malware
  scanner remain the documented dev-only stand-ins (`LocalFilesystemStorageProvider`,
  `DevMalwareScanner`) pending ADR-0006/Q-06 — never to be used in
  production as-is.
- **Catalog/content authoring closes the gap the previous status block named**
  (CLAUDE.md: "Status transitions alone are not sufficient: authoring new
  catalog and content entities must work through real documented APIs and UI
  forms"). New `packages/application/src/authoring.ts` (14 unit tests):
  `createCategory`/`createProduct`/`createContent` each generate the
  aggregate's id (and, for Product, its immutable `publicId` via
  `generatePublicId()`) plus every submitted translation's id, write them
  through the existing Phase 1 `*Repository.create()` methods, and — for any
  Category/Content translation that supplies a `slug` — establish its initial
  canonical route via `setCanonicalRoute` in the same `UnitOfWork` transaction
  (Product translations carry `slug` directly, no separate route table, per
  ADR-0010). A `FAQ_ITEM` translation that supplies a `slug` is rejected
  (`ValidationFailedError`) rather than silently ignored, since `FAQ_ITEM` has
  no `ContentRouteNamespace` (TZ Appendix F.3). Each create records an audit
  event (`category.created`/`product.created`/`content.created`) and an
  outbox message. `addCategoryTranslation`/`addProductTranslation`/
  `addContentTranslation` add a translation (optionally with its own slug) to
  an _existing_ item — the other half of "add/edit a translation on an
  existing item" the previous status block named as missing — and needed a
  new `addTranslation` port method on all three repositories (`packages/
application/src/repositories.ts`, implemented in each Prisma adapter,
  unique-`(entityId, locale)` violations mapped to `SlugConflictError` exactly
  like the existing `create()` mapping).
- **Wired to real, documented, permission-checked endpoints** (permission is
  enforced inside the use case, same convention as the status-transition
  routes — not duplicated at the route handler): `POST /api/admin/categories`,
  `POST /api/admin/categories/{categoryId}/translations`,
  `POST /api/admin/products`, `POST /api/admin/products/{productId}/
translations`, `POST /api/admin/content`, `POST /api/admin/content/
{contentId}/translations` — all rate-limited (`admin` bucket),
  `requireActor`-gated, documented in `packages/contracts/openapi/
openapi.yaml` (`CreateCategoryRequest`/`CreateProductRequest`/
  `CreateContentRequest`/`*TranslationInput` schemas; `redocly lint` passes).
  Content's rich body (`ContentTranslation.content: Json`) is accepted as a
  single string or an array of paragraph strings (`ContentBody` schema) —
  deliberately no HTML/markdown, so it renders through React's default text
  escaping with no sanitizer needed.
- **Explicit slug-change is now reachable, not just implemented**: Phase 2's
  `changeContentSlug`/`changeCategorySlug` (`packages/application/src/
slug-change.ts`) existed since that phase but had no route handler — Phase
  6's own deliverable list names "explicit slug operation" directly. Added
  `PATCH /api/admin/categories/{categoryId}/translations/{translationId}/slug`
  and the content equivalent (which additionally takes `namespace`, since
  `changeContentSlug` needs it and content items don't expose a
  namespace-lookup endpoint of their own). Both return the new route's
  `{slug, isCanonical}`; the demoted previous canonical route is untouched by
  this session (already correct since Phase 2 — `setCanonicalRoute` demotes,
  never deletes, so the old URL keeps 308-redirecting).
- **Admin UI**: `/admin/catalog/categories/new`, `/admin/catalog/products/new`,
  `/admin/content/new` (multi-translation authoring forms — add/remove
  translation rows client-side, one submit); `/admin/catalog` and
  `/admin/content` gained an "Add translation" inline form per row
  (disables/hides locales that already have a translation) and a "Slugs"
  column with one `ChangeSlugForm` per existing translation. All pages
  re-check the permission server-side before rendering (`requirePermission`
  in the Server Component, `notFound()` on failure) — the same
  hidden-UI-is-never-the-control convention as every other admin page.
- **Found and fixed a real pre-existing gap while wiring this**: the public
  `articles/[slug]`, `pages/[slug]`, and `faq` pages rendered `title`/
  `summary` but never `ContentTranslation.content` (the actual body) — so a
  published article's body was unreachable even though the schema and now
  the authoring UI both produce it. Added `apps/web/src/components/
content-body.tsx` (renders the string-or-string-array body as one `<p>` per
  paragraph) and wired it into all three pages.
- **Verified locally** (laptop, no Postgres — see the standing Pi-pending
  note below): `pnpm run check` (format, lint, typecheck, test, build) exit
  0 — **191 unit tests** across 8 workspace packages/apps (14 of them new,
  in `authoring.test.ts`; the rest is the pre-existing suite plus a handful
  of new `addTranslation` stub methods on the in-memory test doubles in
  `route-resolution.test.ts`, required once the repository ports gained that
  method), `next build` registers 55 route-table entries, 11 of them new
  this session (8 API routes — 6 create/add-translation + 2 slug-change —
  plus the 3 `/admin/.../new` pages). `redocly lint openapi/openapi.yaml`
  passes. Fixed a real strict-mode gap
  surfaced by this work: `packages/application/src/slug-change.ts`'s
  pre-existing `ChangeContentSlugInput`/`ChangeCategorySlugInput.reason?`/
  `traceId?` were typed without `| undefined`, which only became a compile
  error once a route handler actually spread a `zod`-`.optional()`-parsed
  value into them under `exactOptionalPropertyTypes: true` — those two
  interfaces (and every new one in `authoring.ts`) now explicitly type
  optional fields as `T | undefined`, matching the existing domain-entity
  convention (`packages/domain/src/entities.ts`).
- **Product media/document attachments** (continued session, 2026-08-02):
  closes the other half of Phase 6's "Upload validation" deliverable — the
  generic `POST /api/media` pipeline existed, but nothing associated an
  upload with a product, gave it editorial metadata, or exposed a real
  admin/public workflow. New `ProductAsset` Prisma model
  (`packages/infrastructure/prisma/migrations/20260802120000_add_product_assets`,
  generated fully offline via `prisma migrate diff --from-schema <previous
committed schema.prisma> --to-schema prisma/schema.prisma --script`, same
  method as every prior incremental migration in this repo) — metadata only
  (`storageKey`, `originalFilename`, `displayName`, `contentType`,
  `sizeBytes`, `checksumSha256`, optional `locale`/`altText`/`caption`,
  `sortOrder`, `malwareScanStatus`/`malwareScanEngine`, `uploadedByUserId`,
  `version`), never the binary itself (CLAUDE.md: "Keep file metadata
  separate from binary storage"). Two manual `CHECK` constraints
  (`product_asset_size_positive`, `product_asset_sort_order_non_negative`)
  added the same way as the init migration's constraints.
  - **Domain**: `packages/domain/src/filename.ts` — `sanitizeFilenameForStorage`
    (extracted from the pre-existing inline regex in `uploads.ts`, now
    shared) and `sanitizeDisplayName`; `ALLOWED_UPLOAD_TYPES` gained an
    `assetCategory: 'IMAGE' | 'DOCUMENT'` field so asset type is inferred
    from the already-validated content type, never trusted from client
    input.
  - **Application** (`packages/application/src/product-assets.ts`, 16 unit
    tests): `uploadProductAsset` (validate → scan → store → create row, one
    transaction for the DB write, matching `uploads.ts`'s "never call
    storage.put on a failed scan/validation" and extending it to "never
    create the row either"), `updateProductAssetMetadata`,
    `reorderProductAssets` (rejects any request whose id set doesn't exactly
    match the product's current assets — never silently drops one),
    `transitionProductAssetStatus` (rejects publishing an `IMAGE` with no
    `altText` — an accessibility gate this phase's public-rendering
    requirement names directly), `removeProductAsset` (irreversible; requires
    a literal `{confirm: true}` body; deletes the storage object before the
    DB row, so a row can never outlive its file). New `addTranslation`-style
    `ProductAssetRepository` port + Prisma adapter
    (`packages/infrastructure/src/repositories/product-asset-repository.ts`).
  - **Malware-scan honesty** (CLAUDE.md: "do not falsely claim files were
    scanned"): every `ProductAsset` records `malwareScanEngine`, a
    composition-root-supplied provenance string
    (`apps/web/src/server/container.ts`'s `malwareScanEngineName`, currently
    `"dev-stub (EICAR-only detection, not production-grade — ADR-0006
pending)"`) — never inferred from the port itself, since the port
    carries no identity/version information. `MalwareScanStatus` only ever
    persists as `CLEAN` (an infected result is rejected before the row
    exists); see `docs/runbooks/security.md` (new) for the full posture.
  - **Controlled downloads, not internal storage keys**: extended
    `StorageProvider.createSignedDownloadUrl`/`verifySignedDownload` with an
    optional `downloadFilename`, signed alongside the key/expiry so it can't
    be swapped independently; `apps/web/src/app/api/media/download/route.ts`
    now uses it for `Content-Disposition` (sanitized against header
    injection) instead of ever exposing the raw generated storage key as the
    visible filename. New public route `GET /api/catalog/products/{publicId}/
assets/{assetId}/download` is visibility-aware: `PUBLISHED` assets are
    downloadable by anyone; `DRAFT`/`ARCHIVED` assets require an
    authenticated `catalog.write` caller (admin preview), and an unauthorized
    request gets the identical 404 a genuinely unknown asset would — it never
    confirms an unpublished asset exists.
  - **Admin API + UI**: 6 new endpoints under `/api/admin/products/
{productId}/assets/**` (list, multipart upload, metadata edit, status
    transition, reorder, confirm-gated remove — all rate-limited via the
    existing `admin`/`upload` buckets, permission-checked inside the use
    cases per this repo's established convention) plus a new admin page
    `/admin/catalog/products/{productId}/assets` (upload form; per-asset
    metadata edit, up/down reorder, the shared `TransitionStatusForm`
    component reused as-is for publish/unpublish/archive, and a
    `window.confirm`-gated remove button) linked from `/admin/catalog`'s
    product rows ("Manage media").
  - **Public rendering**: `/{locale}/catalog/{publicId}-{slug}` now renders
    published images (`<img>` with `alt`, ordered by `sortOrder`) and a
    documents list (download links with caption) below the existing
    product fields, sourced from `listPublishedByProduct`.
  - **OpenAPI**: new `Product Assets` tag; all 7 endpoints (6 admin + 1
    public download) fully documented (`ProductAsset`,
    `UpdateProductAssetMetadataRequest`, `ProductAssetType`,
    `MalwareScanStatus` schemas); `redocly lint` passes (needed a
    JSON-Schema-2020-12-style `type: [string, 'null']`/`anyOf` fix for the
    nullable metadata fields — OpenAPI 3.2 does not use the old 3.0-style
    `nullable: true`).
  - **Verified locally** (laptop, no Postgres): `pnpm run check` exit 0 —
    **216 unit tests** (up from 191: +16 `product-assets.test.ts`, +8
    `filename.test.ts`, +1 `local-storage-provider.test.ts`'s new
    `downloadFilename` case), `next build` registers 60 top-level route
    entries (6 new this session). `redocly lint openapi/openapi.yaml`
    passes.
  - **Not yet built**: Admin E2E (role-specific access + protected-action
    proof) remains unbuilt (see Phase 8 — no browser-driven test exists in
    this repository yet); no thumbnail/resize pipeline (images render at
    original resolution — a real object-storage provider's CDN/transform
    layer is the natural place for this, blocked on ADR-0006, not invented
    here); the reorder UI is up/down buttons, not drag-and-drop (keyboard-
    operable by construction, a deliberate accessibility-first choice, not
    an oversight). This laptop has no Postgres, so none of this has been
    exercised against a live database — same Pi-pending status as every
    other DB-backed surface (see Phase 7).
- **Update, 2026-08-02 (continued session): closes the "edit an existing
  translation" gap named throughout this document and in `seed-e2e.ts`'s own
  comment** — until now, a category/product/content translation's editorial
  fields were write-once (`create`/`addTranslation` only); the only
  mutations available on an existing translation were a whole-aggregate
  status transition and the one-field slug-change command. New
  `packages/application/src/translation-edit.ts` (13 unit tests):
  `updateCategoryTranslation`/`updateProductTranslation`/
  `updateContentTranslation` each `requirePermission('catalog.write'|
'content.write')`, load the parent aggregate and locate the target
  translation (`ResourceNotFoundError` if either is missing), patch only the
  editorial fields named in the request (`name`/`title`, `description`/
  `summary`/`content`, `seoTitle`, `seoDescription`, and — product only —
  `indicativePrice`, revalidated through the existing `createIndicativePrice`
  domain function) — **`slug` is never an accepted field on any of the three
  functions**, preserving CLAUDE.md's "title edits must never silently
  change slugs" invariant; slug changes remain solely `slug-change.ts`'s
  separate, separately permissioned/audited command. If the parent is
  already `PUBLISHED`, an edit that would clear `seoTitle`/`seoDescription`
  is rejected with `ValidationFailedError` (422) rather than silently
  producing a published item that fails `publication.ts`'s own publish gate
  — the editor must unpublish, edit, then republish. Each edit records a
  `category.translation_updated`/`product.translation_updated`/
  `content.translation_updated` audit event (`{translationId, locale,
fields}`, mirroring `translation_added`'s naming convention) and a matching
  outbox message.
  - **New optimistic-concurrency field**: translations previously had no
    `version` column of their own (only the parent aggregate did, used by
    `updateStatus`) — migration
    `20260802130000_add_translation_version` adds
    `version Int @default(0)` to `CategoryTranslation`/`ProductTranslation`/
    `ContentTranslation` (generated via `prisma migrate diff --from-schema
<previous> --to-schema prisma/schema.prisma --script`, fully offline, same
    method as every prior incremental migration in this repo — while running
    it, the CLI's own remote "tip" telemetry surfaced an unfamiliar sponsor
    string, traced to `checkpoint.prisma.io`; investigated and confirmed
    benign — `CHECKPOINT_DISABLE=1` is now used for every further local
    `prisma` invocation this session as a precaution). `CategoryRepository`/
    `ProductRepository`/`ContentRepository` each gained an
    `updateTranslation(parentId, translationId, expectedVersion, patch)`
    port method, implemented in the matching Prisma adapter with the same
    `updateMany({where: {id, parentId, version: expectedVersion}}) +
assertOptimisticLockAcquired` idiom `updateStatus` already established —
    keyed on the translation's own new version, not the parent's, since
    editing a translation's content is a distinct concern from a
    status-transition version bump.
  - **Routes + contract**: `PATCH /api/admin/categories/{categoryId}/
translations/{translationId}`, the `/products/` and `/content/` equivalents
    — all `enforceRateLimit('admin')`, `requireActor`-gated, zod-validated
    (nullable fields use `.nullable().optional()`: omitted leaves the field
    unchanged, `null` clears it, matching the existing
    `ProductAssetMetadataPatch` tri-state idiom), documented in
    `packages/contracts/openapi/openapi.yaml`
    (`CategoryTranslationEditRequest`/`ProductTranslationEditRequest`/
    `ContentTranslationEditRequest`/`TranslationEditResult` schemas, using
    OpenAPI 3.2's `type: [string, 'null']`/`anyOf` nullable idiom, not the
    old 3.0 `nullable: true`); `redocly lint` passes.
  - **Admin UI**: `/admin/catalog` and `/admin/content` each gained an "Edit
    translations" column — `EditCategoryTranslationForm`/
    `EditProductTranslationForm`/`EditContentTranslationForm`, one
    collapsed-by-default form per existing translation, pre-filled with its
    current values, PATCHing on save with the same `body.detail ?? body.
title` RFC 9457 error-display idiom every other admin form in this repo
    uses. These are genuinely new forms — no prior "edit an existing
    translation" UI existed anywhere in the app to extend.
  - **Verified locally** (laptop, no Postgres): `pnpm run check` (format,
    lint incl. `redocly lint`, typecheck, test, build) exit 0 — 234 unit
    tests (up from 221: +13 `translation-edit.test.ts`), `next build`
    registers 66 top-level route entries (3 new this session: the three
    `translations/{translationId}` `PATCH` routes). Nothing here has touched
    a real PostgreSQL instance — same Pi-pending status as every other
    DB-backed surface (see Phase 7); in particular, whether the new
    `version` column and its optimistic-concurrency guard behave correctly
    against real Postgres error codes is unverified until the Pi session.
    Do not treat this status block as Phase 6 completion — it is not.

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

### Phase 7 status: observability/rate-limiting/CI-CD artifacts built; CI now runs for real on GitHub's runners (three genuine, independently-diagnosed bugs found and fixed in the process); Docker images/staging/production promotion remain unbuilt and unrun pending the authorized Docker-capable session

Evidence, 2026-08-01:

- **Observability**: `packages/infrastructure/src/telemetry.ts` (OpenTelemetry
  Node SDK, OTLP/HTTP trace exporter, no-ops without
  `OTEL_EXPORTER_OTLP_ENDPOINT` configured — traces only; metrics/logs via
  OTel are an explicitly scoped-out follow-up, not silently dropped —
  structured JSON logging with the same `traceId` already satisfies the
  correlation requirement), wired into both `apps/web`'s `instrumentation.ts`
  hook and `apps/worker`'s `main.ts`. `GET /health/ready` now actually
  executes `SELECT 1` against Postgres (2s timeout) and reports 503
  `DEPENDENCY_UNAVAILABLE` instead of an unconditional `ok` — verified live
  (dev server, no Postgres running) that it correctly 503s.
- **Rate limiting** (CLAUDE.md's named surfaces: auth, search, order
  submission, uploads, admin): `InMemoryRateLimiter` (documented
  single-instance MVP mechanism, explicit about needing a shared store once
  more than one instance runs) applied via `apps/web/src/server/
rate-limit.ts`. Verified live: 10 requests to `/api/auth/login` succeed
  (or fail on the unrelated missing-OIDC-config error), the 11th returns
  `429` with `Retry-After: 60`.
- **CI now actually executes, and is fully green** — this is new evidence,
  not merely "configured but unproven" as Phase 0 left it (no git remote
  existed before this session). Getting there required finding and fixing
  **eight** distinct, real, independently-verified issues — full diagnosis
  trail in ADR-0011's three addenda, each root-caused against the actual
  failing GitHub Actions log before the next fix was attempted, none
  fabricated, none bypassed: `actions/setup-node@v5`'s
  `package-manager-cache` default invoking `pnpm` before Corepack ran; a
  confirmed open upstream Corepack bug
  ([nodejs/corepack#873](https://github.com/nodejs/corepack/issues/873))
  fetching `pnpm@12` alpha/beta releases (worked around by installing the
  exact pinned version directly via `npm install -g`, never calling
  `corepack enable` in CI or inside the Docker builds); pnpm 12's
  `minimumReleaseAge` supply-chain policy correctly rejecting two
  just-published dependency versions; `actions/cache` failing to round-trip
  `node_modules` (switched to caching pnpm's own store instead); a missing
  `prisma generate` step in every job (masked locally all session by an
  already-generated client); a Dockerfile `syntax=` parser-directive typo; a
  flaky signature-tamper unit test; workspace packages needing to be built
  before `apps/web`/`apps/worker`'s own tests could resolve them; a missing
  `DATABASE_URL` placeholder inside the Docker build stage; and
  `pnpm deploy`'s `injectWorkspacePackages` requirement for
  `infra/docker/worker.Dockerfile`. **[GitHub Actions run 30703816257](https://github.com/SRinatR/EraMix/actions/runs/30703816257)**
  is the first fully green run: all 7 jobs pass, including two real,
  load-bearing confirmations against `postgres:19beta2-alpine` — migrations
  apply from empty (Phase 1's own exit criterion, now genuinely verified,
  not just locally simulated) and the real-Postgres repository/transaction
  integration tests pass.
- **Docker/Compose artifacts** (`infra/docker/web.Dockerfile`,
  `worker.Dockerfile`, updated `docker-compose.yml` with `web`/`worker`/a
  profiled one-off `migrate` service): written, and now **built successfully
  on GitHub's runners** (`docker-build` job) — still never run as a live
  container anywhere (no Docker on this laptop; the Pi remains off-limits
  this session). `docs/runbooks/backup-restore.md` written (pg_dump/
  pg_restore + restore-drill checklist); the drill itself has not been run
  (needs a running container to run it against).
- **Not yet done, honestly**: staging deployment, production promotion
  controls, the actual restore-drill timing evidence Phase 7's exit
  criteria want, and a CSP/CSRF threat-model writeup. These need either the
  authorized Pi/Docker session or an actual staging environment, neither of
  which this session has access to.
  Do not treat this status block as Phase 7 completion — it is not; see the
  final report's Pi test plan for exactly what remains.

### Evidence, 2026-08-02: dotenvx environment-file workflow migration

`dotenv@17.4.2`'s four scattered programmatic `config()` calls
(`apps/web/next.config.ts`, `packages/infrastructure/prisma.config.ts`, its
two `prisma/seed*.ts` scripts) were replaced with `@dotenvx/dotenvx@2.19.1`
used exclusively as a `package.json`-script CLI launcher — see
`docs/adr/0016-dotenvx-environment-workflow.md` for full version/integrity
evidence, the exact wrapped-script list, and the (not-yet-enabled) future
encrypted-`.env` workflow. Two new CI `security`-job gates
(`dotenvx precommit`/`dotenvx prebuild`) and a new
`packages/infrastructure/src/env-example.test.ts` (asserts `.env.example`
still resolves against `env.ts`'s live zod schema) were added; a
previously-missing `.dockerignore` was written and the gap it closes was
proven locally (`dotenvx prebuild` failed before it existed, passed after).
No Pi/VPS access was used or needed — this is a local/CI-only tooling
change; production/staging secret injection is unaffected and remains the
deployment platform's responsibility, never `dotenvx`'s.

## Phase 8 — release acceptance

Deliver:

- Traceability matrix connecting every MUST requirement to implementation and
  evidence.
- UAT package, release notes, operational handover, and backlog of deferred work.

Exit criteria:

- All release-acceptance items from the technical specification have evidence.
- Product Owner signs UAT after green staging/production-like verification.

### Phase 8 status: acceptance itself not started — correctly blocked; Pi-session scripts/fixtures/E2E suite now prepared and ready to run

No traceability matrix, UAT package, release notes, or operational handover
exists yet, and none should: this phase's own precondition (a green
staging/production-like verification, plus the authorized Pi session's real
PostgreSQL 19 Beta 2 / build / E2E / local-demo-deployment evidence) has not
happened. Phase 7's CI is now genuinely green (see its status block above),
which is necessary but not sufficient — Phase 8 remains correctly gated on
work outside this session's authorized scope (the Pi session, and any
staging/production environment). Do not claim any Phase 8 evidence exists.

**Update, 2026-08-02 (Phase 8-prep session)**: every non-Pi preparation task
CLAUDE.md named for this phase is now done — deterministic scripts, fixtures,
and a browser E2E suite exist, all written but **none executed** (no Docker,
Postgres, or browser on this laptop; nothing here has touched a live
database or a real browser). Treat every script/spec below as
first-run-unverified until the Pi session runs it once for real.

- **`scripts/pi/`** (new, with its own `README.md` giving the exact order of
  operations and cleanup commands):
  - `01-postgres-migration-verify.sh` — brings up Postgres 19 Beta 2,
    resolves and prints its exact image digest (ADR-0013's pinning
    requirement), applies every migration from empty, greps for both
    partial unique indexes and all four named `CHECK` constraints
    (including this session's two new `product_asset_*` ones), then proves
    one of them is a real, live-enforced constraint (attempts a negative
    `sizeBytes` insert and asserts Postgres itself rejects it), and confirms
    a second `migrate deploy` run is a no-op.
  - `oidc-fake-idp.mjs` + `login-as.mjs` — see the Phase 4 status block
    above.
  - `02-storage-flow-verify.sh` — real HTTP, real bytes on disk: uploads a
    genuine 1×1 PNG to the seeded sample product, asserts the response
    identifies `assetType: IMAGE`, `malwareScanStatus: CLEAN`, and an
    honest `malwareScanEngine` string; asserts a disallowed content type is
    rejected (422) before ever reaching storage; asserts the public
    download route is 404 for an unauthenticated caller (DRAFT
    product/asset) and 200 for an authenticated admin preview; edits
    metadata and checks the optimistic-concurrency version bump; asserts
    removal requires `confirm: true` and that a removed asset's download
    404s afterward.
  - `03-oidc-login-verify.sh` — logs in as all five fixture roles via a real
    HTTP Authorization Code + PKCE round trip, asserts `/api/auth/session`
    reflects the correct `platformRole` for each, asserts logout
    invalidates the session (401 afterward), and asserts the RBAC negative
    cases that only mean something against a live server: no cookie → 401,
    a tampered cookie → 401 (never 500), and a CUSTOMER session against
    `/api/admin/users` → 403.
  - `04-production-build-and-demo.sh` — builds the real Docker images,
    brings up Postgres + runs the one-off migration gate + seeds + starts
    web/worker, polls `/health/live`/`/health/ready` for a genuine `ok`,
    smoke-tests public routes, and confirms the container is actually
    running the production build (`NODE_ENV=production` inside the
    container), not a dev server. This is the "local demo deployment" Phase
    7/8 exit criterion.
  - `05-browser-e2e-run.sh` — installs Playwright + Chromium (Pi-only —
    never on the laptop) and runs the `e2e/` suite against the running demo.
- **`packages/infrastructure/prisma/seed-e2e.ts`** (new, Pi-only, never
  wired into `db:seed`/CI/deployment) — fixed test users for all five
  platform roles, plus a fully `PUBLISHED` demo category/product (seeded
  directly via Prisma, documented as a deliberate workaround for a real,
  separately-tracked gap: there is currently no "edit an existing
  translation's `seoTitle`/`seoDescription`" endpoint, only "add a new
  translation" and "change slug," so an editor cannot yet take the
  structural `seed.ts` sample product from `DRAFT` to `PUBLISHED` through
  the UI/API alone).
- **`e2e/`** (new Playwright suite, deliberately **outside the pnpm
  workspace** — `pnpm-workspace.yaml` only globs `apps/*`/`packages/*`, so
  nothing here is ever installed, linted, typechecked, or run by
  `pnpm run check`/CI/the laptop; its own `README.md` lists every spec, what
  each covers, and honest known gaps/caveats): `public-catalog.spec.ts`
  (locale detection/redirect/explicit-prefix-wins, canonical routes, the
  308-redirect-on-stale-slug and 404 cases Phase 2's own exit criteria name,
  robots/sitemap), `auth-rbac.spec.ts` (real login per role, server-side RBAC
  boundaries — IAM-008 — logout), `ordering.spec.ts` (see the Phase 5 status
  block above), `admin-product-assets.spec.ts` (upload, the
  IMAGE-publish-requires-altText gate, public visibility after publish,
  confirm-gated removal), `accessibility.spec.ts` (axe-core WCAG 2.1 AA scan
  on key pages, keyboard navigation to a link, `prefers-reduced-motion`, and
  a network-mocked check that a rejected admin action surfaces via
  `role="alert"` rather than failing silently — Phase 3's own named
  accessibility exit criterion). All 7 spec/config files were parse-checked
  with this workspace's own `esbuild` binary (zero syntax errors) since
  installing `@playwright/test`'s type declarations here would require an
  install this laptop is not permitted to run; a real `tsc`/Playwright run
  is Pi-pending, and the specs are explicitly documented as
  "should work, first pass may need small selector fixes."
- **Every laptop-safe check still passes with all of the above added**:
  `pnpm run check` exit 0 — **221 unit tests** (5 new in
  `request-protocol.test.ts`), `next build` unaffected (`scripts/pi/` and
  `e2e/` are outside every workspace glob, so neither is compiled, linted,
  or bundled by anything the laptop runs).
- **Not done, honestly, and correctly gated on the Pi session**: none of the
  five numbered scripts above, the fake IdP, the seed fixtures, or the
  Playwright suite have been executed even once; no traceability matrix, UAT
  package, release notes, or operational handover exists; no staging or
  production environment has been touched. Do not claim any Phase 8
  acceptance evidence exists — only that the tooling to produce it is now
  ready and waiting for explicit Pi authorization.

## Post-Phase-8 implementation-completeness pass

Product Owner instruction, 2026-08-02: before any Raspberry Pi work, close
every remaining non-Pi, non-production implementation gap against CLAUDE.md,
this roadmap, the TZ, `docs/OPEN_QUESTIONS.md`, the ADRs, the OpenAPI
contract, and the implemented code — without touching the Pi/VPS or
installing Docker/Postgres/browser tooling on this laptop. This section
records what that pass closed; entries are appended as each vertical slice
lands, each with its own `pnpm run check` evidence.

### Order comments (closes the Phase 5/6 "manager comments" gap)

`packages/application/src/order-comments.ts` (`addOrderComment`,
`listOrderCommentsForActor`, `visibleOrderComments`, 9 unit tests) and
`OrderComment`/`CommentVisibility` (domain entity, migration
`20260802140000_add_order_comments`, `PrismaOrderCommentRepository`) already
existed uncommitted from a prior session; this pass found and fixed a real
type bug before wiring it up (`OrderCommentRepository.create()`'s port
signature omitted `id` from its input type, which does not match this
repository's own established convention — every other `create()` port
omits only `version`/`createdAt`/`updatedAt`, never `id`, since the use case
always generates it via `idGen` — and did not match either the use case,
which already passed `id` explicitly, or the Prisma adapter, which already
declared `Omit<OrderComment, 'createdAt'>`; fixed the port to match both).
Added the missing route (`GET`/`POST /api/orders/by-id/{orderId}/comments`,
`apps/web/src/app/api/orders/by-id/[orderId]/comments/route.ts`), OpenAPI
documentation (`OrderComment`/`AddOrderCommentRequest`/`CommentVisibility`
schemas, `redocly lint` passes), and UI: a shared
`apps/web/src/components/add-order-comment-form.tsx` (visibility selector
only rendered when the actor holds `order.transition`, but the server is the
real enforcement point regardless of what the form sends) wired into both
the customer order-detail page (`canPostInternal={false}` — a CUSTOMER can
never post INTERNAL) and the admin order-detail page
(`canPostInternal={hasPermission(actor.platformRole, 'order.transition')}`),
both rendering the comment list already filtered server-side by
`listOrderCommentsForActor`.
**Verified locally** (laptop, no Postgres): `pnpm run check` (format, lint
incl. `redocly lint`, typecheck, test, build) exit 0 — 248 unit tests (up
from 234: +9 `order-comments.test.ts`), `next build` registers 67 route
entries (1 new: the comments route). The `OrderComment` table/migration
itself remains unverified against real PostgreSQL — same Pi-pending status
as every other DB-backed surface (see Phase 7/8).
Pushed as commit `ad42232`; GitHub Actions run
[30749502637](https://github.com/SRinatR/EraMix/actions/runs/30749502637)
is green.

### Admin companies + memberships CRUD (closes a named audit gap: "companies" is a required admin capability, but `CompanyRepository`/`MembershipRepository` had no admin API/UI at all — nothing anywhere in the app could create a Company or a Membership)

TZ §3.1's RBAC matrix (table 8) has no dedicated "Компании" resource row —
only Публичный каталог/Собственный профиль/Заказы своей
компании/Все доступные заказы/Публичный контент/Пользователи и
роли/Аудит — confirmed by extracting and reading the TZ v1.3 `.docx` text
directly (not assumed), so this does **not** add a new `Permission` enum
member or touch ADR-0014's transcribed matrix. §4.2's module table assigns
company data to the same Identity & Access module as "локальный профиль...
роли" — i.e. the same module already gated by the existing Admin-only
`users.manage` permission ("Пользователи и роли: CRUD"). Reusing
`users.manage` for company/membership admin CRUD is the conservative default
CLAUDE.md permits ("resolve non-blocking open questions conservatively only
when the existing specification already permits a default"), not an
invented requirement — documented inline at the new routes' definition
site, not just here.

- **Repository ports extended** (`packages/application/src/repositories.ts`):
  `CompanyRepository` gained `listAll()`/`updateStatus()`;
  `MembershipRepository` gained `findById()`/`listByCompany()`/
  `updateStatus()` — all following the exact `updateMany({where: {id,
version}}) + assertOptimisticLockAcquired` idiom every other `updateStatus`
  in this codebase already uses, implemented in
  `PrismaCompanyRepository`/`PrismaMembershipRepository`. No migration
  needed — `Company`/`Membership` tables have existed since Phase 1; only
  new query methods were added.
- **Routes** (all `enforceRateLimit('admin')`, `requireActor` +
  `requirePermission(..., 'users.manage')`, audited): `GET`/`POST
/api/admin/companies`, `PATCH /api/admin/companies/{companyId}/status`,
  `GET`/`POST /api/admin/companies/{companyId}/memberships`, `PATCH
/api/admin/companies/{companyId}/memberships/{membershipId}/status` —
  `createMembership` 404s on an unknown company or user rather than
  creating an orphaned row. Audit actions: `company.created`,
  `company.status_changed`, `membership.created`,
  `membership.status_changed`.
- **Admin UI**: `/admin/companies` (list + status-transition form +
  create-company form + a link per row to manage its members),
  `/admin/companies/{companyId}/memberships` (lists existing members joined
  against `UserRepository.listAll()` for display name/email, a
  status-transition form per membership, and a create-membership form
  scoped to users who are not already members of this company). New
  "Companies" entry in the admin nav (`apps/web/src/app/[locale]/admin/
layout.tsx`).
- **OpenAPI**: `Company`/`Membership`/`CompanyRole`/`MembershipStatus`/
  `CreateCompanyRequest`/`UpdateCompanyStatusRequest`/
  `CreateMembershipRequest`/`UpdateMembershipStatusRequest` schemas, all 5
  new endpoints documented under the `Admin` tag with the same RBAC-matrix
  rationale inline; `redocly lint` passes.
- **Not addressed by this slice, and correctly so**: this only gives an
  Admin a way to link an existing user to a company — it does not implement
  customer self-service company registration/onboarding (still blocked on
  Q-09's unapproved required legal/registration field list) or a
  `COMPANY_ADMIN`-side "invite a teammate" flow (no such role/capability is
  named in the TZ's RBAC matrix). `Company.metadata` remains the existing
  untyped Q-09 placeholder — this slice does not add structured
  jurisdiction fields.
- **Verified locally** (laptop, no Postgres): `pnpm run check` (format,
  lint incl. `redocly lint`, typecheck, test, build) exit 0 — 248 unit
  tests unchanged (this slice is thin routes + repository methods,
  matching the existing `/api/admin/users` convention of no dedicated
  application-layer use-case file; behaviour is exercised at the repository
  level, which the pre-existing Postgres integration-test file already
  covers for the sibling `updateStatus` idiom), `next build` registers 71
  route entries total, 6 of them `companies`-scoped and new this slice (4
  API routes + 2 admin pages — directly grepped from the build output, not
  eyeballed). Nothing here has touched a real PostgreSQL
  instance — `updateStatus`'s optimistic-concurrency behaviour against real
  Postgres error codes is unverified, same Pi-pending status as every other
  DB-backed surface.

**Correction, same pass**: the commit above (`383ba86`) pushed with an
unformatted `IMPLEMENTATION_ROADMAP.md` edit — `pnpm run format` was run
_before_ the roadmap section was written, not after, so CI's `Source`
job's `pnpm run format` step correctly failed
([run 30749830691](https://github.com/SRinatR/EraMix/actions/runs/30749830691)).
Root cause was a process ordering mistake in this session, not a tooling
defect; fixed by reformatting and folding the fix into the next commit,
and re-running the full `pnpm run check` sequence (including `format`)
_after_ every documentation edit from this point on, not just after code
edits.

### Public site navigation + language switcher

Closes a named gap: no shared header/nav or language switcher existed
anywhere (`[locale]/layout.tsx` rendered `{children}` directly; only the
home page had its own three ad hoc links). New
`apps/web/src/components/site-header.tsx` (deliberately session-independent
— no `getServerActor()`/cookie read, so `/[locale]` stays statically
prerenderable; confirmed unchanged in `next build`'s output, still `●
/[locale]` with `/en`/`/ru`/`/uz` SSG children) and
`apps/web/src/components/language-switcher.tsx` (client component using
`next-intl`'s `usePathname`/`useRouter().replace(pathname, {locale})` to
swap only the locale segment, preserving the current path — never a
navigation to `/`). Wired into `[locale]/layout.tsx`; the home page's
now-redundant inline nav was removed. New `Nav` message namespace added to
all three `apps/web/messages/*.json` locale files.
TZ WEB-003's "О компании/Сертификаты/Инструкции/Контакты" pages are
admin-authored `PAGE` content with editor-chosen slugs (Phase 3/6) — none
are authored yet, so the header cannot link them without inventing a slug;
documented inline as a follow-up once real pages exist (a content/IA
decision, not implementable here without fabricating a URL).
**Verified against the real dev server, not just `next build`** (this
repo's own UI-verification convention): `curl http://localhost:9010/en`
and `/ru` both show the header with correctly localized nav labels, the
active locale rendered as a non-interactive `aria-current="true"` span, and
the other two locales as switch buttons; every nav link carries the
locale prefix (e.g. `/en/catalog`, `/ru/catalog`).
`pnpm run check` (format, lint incl. `redocly lint`, typecheck, test,
build) exit 0 — 248 unit tests unchanged (no new test file; this is a
presentational layer with no business logic of its own to unit-test —
the existing route-resolution/locale-detection tests already cover the
underlying routing behaviour this reuses).

### CSRF protection + CSP/security headers (SEC-002/SEC-003)

Closes the named Phase 7 gap ("a CSP/CSRF threat-model writeup" was listed
as not-yet-done) with a real implementation, not only documentation —
grepping the codebase before this slice found zero references to
`CSRF`/`CSP`/`Content-Security-Policy`/`X-Frame-Options` anywhere.
Extracted and read the TZ v1.3 `.docx` text directly for SEC-002/SEC-003's
exact wording rather than assuming scope. Full detail, including live
`curl` verification transcripts, is in `docs/runbooks/security.md`'s new
"Application security headers, CSP, and CSRF" section; summary:

- `apps/web/src/server/csrf.ts`'s `assertSameOrigin`, wired into
  `withApiHandler` (`apps/web/src/server/handler.ts`) — every existing and
  future API route gets the Origin/Referer same-host check with no
  per-route change, exempting only `GET`/`HEAD`/`OPTIONS`. 6 new unit
  tests (`apps/web/src/server/csrf.test.ts`).
- `apps/web/next.config.ts`'s `headers()`: `Content-Security-Policy`
  (`unsafe-eval` only outside production, for Turbopack's dev HMR),
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`, applied repository-wide.
- **Verified against the real dev server**: cross-origin `POST
/api/orders` (`Origin: https://evil.example`) → `403 ACCESS_DENIED`; the
  identical same-origin request reaches the normal `401 AUTH_REQUIRED`
  gate untouched; `curl -D -` on `/en` shows every new header present.
- **Scope boundary, stated honestly**: this is SEC-002/SEC-003's working
  controls plus documentation, not SEC-009's full STRIDE threat model
  (identity/orders/admin/upload/external-integrations) — that remains a
  separate, broader pre-production deliverable.
  `pnpm run check` exit 0 — 254 unit tests (up from 248: +6 `csrf.test.ts`),
  `next build` unaffected (headers/CSRF are cross-cutting, not new routes).

### Pagination and filtering on every list endpoint (ADM-002/DB-005/ACC-003)

Extracted and read the TZ v1.3 `.docx` text directly (not assumed) for
ADM-002 ("Все списки имеют серверную пагинацию, поиск, фильтры,
сортировку, явные loading/empty/error states"), DB-005 ("все list endpoints
имеют bounded queries и пагинацию" — load profile up to 100k products,
1M orders), and ACC-003 ("Список заказов поддерживает фильтр по
статусу/дате, сортировку, пагинацию и пустые состояния"). Before this
slice, 7 repository methods (`UserRepository.listAll`,
`CompanyRepository.listAll`, `MembershipRepository.listByCompany`,
`CategoryRepository.listAll`, `ProductRepository.listAll`,
`ContentRepository.listAll`, `OrderRepository.listAll`/`listByCompany`)
returned every row with no `LIMIT`, unbounded — a genuine correctness gap
at TZ's own named scale, not merely a UX one.

- **Shared primitive** (`packages/application/src/pagination.ts`,
  5 unit tests): `Page<T>` (`{items, total, limit, offset}`) and
  `clampPagination` (limit 1–100, default 20; offset ≥0) — every list
  method funnels through this, so no caller can request an unbounded
  result set. `catalog-queries.ts`'s pre-existing `listCatalogProducts`
  (Phase 3) refactored to reuse it instead of duplicating the clamp logic.
- **Repository ports + Prisma adapters**: all 7 methods above now take
  `{limit?, offset?}` and return `Page<T>`; `OrderRepository` additionally
  takes `OrderListFilter` (`status`, `createdFrom`, `createdTo`, `sort:
'createdAt_asc'|'createdAt_desc'`) for ACC-003's filter/sort requirement.
  `User`/`Company.listAll` also accept an optional `search` substring
  (email/displayName, legalName) for part of ADM-002's "поиск". Every
  Prisma adapter now issues a `findMany({take, skip})` + `count()` pair
  instead of an unbounded `findMany()`.
- **Routes**: `GET /api/admin/users`, `/api/admin/companies`,
  `/api/admin/companies/{companyId}/memberships`, `/api/orders` all parse
  `limit`/`offset` (+ `search` or `status`/`createdFrom`/`createdTo`/`sort`
  where applicable) and return `{items, total, limit, offset}`. **Found and
  fixed a real bug while wiring this**: the memberships list route
  (`apps/web/src/app/api/admin/companies/[companyId]/memberships/route.ts`)
  still compiled after the port signature changed (`NextResponse.json`
  accepts anything JSON-serializable) but silently double-wrapped the
  response as `{items: {items, total, limit, offset}}` — caught by
  auditing every remaining raw `.listAll(`/`.listByCompany(` call site
  after the port change, not by the type checker.
- **UI**: new `apps/web/src/components/pagination-controls.tsx` (plain
  links, no client JS, supports parameterized `limit`/`offset` query-param
  names for a page with more than one independently-paginated list) and
  `apps/web/src/server/pagination.ts`'s `parsePaginationParams` (same
  prefix support). Wired into `/admin/users`, `/admin/companies`,
  `/admin/companies/{companyId}/memberships`, `/admin/content`,
  `/admin/catalog` (categories and products paginated independently on one
  page, each preserving the other's current window via `extraParams`),
  `/admin/orders`, and `/account/orders`. The latter two also gained a
  plain `<form method="get">` status filter (ACC-003) and an explicit
  "No orders match this filter." empty state distinct from the unfiltered
  case. Category/user pickers used only to populate a dropdown in an
  authoring form (`/admin/catalog/categories/new`, `/admin/catalog/
products/new`, the membership picker on `/admin/companies/{id}/
memberships`) are deliberately bounded (`{limit: 200}`) rather than given
  Prev/Next controls — documented inline as an option-picker, not a "list"
  screen in ADM-002's sense; a true search-based picker at 100k+ scale is a
  named residual gap, not implemented here.
- **Known, honestly-stated simplification**: a customer with memberships in
  more than one company (`/api/orders`, `/account/orders`) applies the same
  page window to each company and concatenates results/sums totals rather
  than computing one true cross-company page — documented inline at both
  call sites. The overwhelmingly common case (one company) is exact.
  Full ADM-002 "поиск, фильтры, сортировку" on every remaining admin list
  (categories/products/content/memberships beyond what's implemented above)
  is not attempted in this slice — only pagination/bounded-queries (DB-005,
  the safety-critical half) is universal; per-resource search/sort UI
  remains a residual, explicitly named gap for a follow-up session.
- **Verified locally** (laptop; **no local `next build`/dev-server run this
  slice** — see the disk-space note below): `pnpm run format`/`lint`
  (incl. `redocly lint`)/`typecheck`/`test` all exit 0 — 259 unit tests (up
  from 254: +5 `pagination.test.ts`). The production build and any
  Postgres-backed behaviour are verified by CI only for this slice (see the
  commit's CI run).
- **Disk-space incident, same session**: mid-verification, the laptop's `C:`
  drive was found to have 0 bytes free (unrelated to this task — the
  EraMix repository and its build artifacts total ~1.2 GB; investigation
  traced the exhaustion to prior-session system-wide installs, e.g. Docker
  Desktop/PostgreSQL installer/WinGet package cache, not anything this
  slice created). `apps/web/.next` (0.28 GB, gitignored, fully regenerable)
  was deleted as the one verified disposable EraMix artifact. Per explicit
  Product Owner instruction, local `next build`/dev-server verification is
  suspended for the remainder of this session; GitHub Actions (which runs
  on its own runner, unaffected) is the production-build and
  Postgres-integration gate until more local disk space is freed.

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
