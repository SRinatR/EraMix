# EraMix implementation instructions

## Mission and source of truth

Implement the EraMix B2B MVP incrementally, with production-quality contracts
and verification at every phase. The authoritative product and engineering
requirements are in:

- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/runbooks/search-visibility.md` (mandatory English SEO and search
  operations contract)
- `docs/EraMix_Полное_техническое_задание_MVP_v1.3.docx` (historical baseline
  only; do not create new DOCX revisions for SEO requirements)

For any public-site, content, SEO, analytics, or deployment task, read the
roadmap and `docs/runbooks/search-visibility.md` completely before changing
code. Markdown is the authoritative living SEO documentation; update it in the
same change as any requirement or implementation change.

Do not invent requirements that contradict these documents. If a requirement is
ambiguous or a product decision is missing, record it in an ADR or open-question
file and stop before implementing the affected irreversible behaviour.

## Operating mode

1. Start each task by reading the relevant phase in
   `docs/IMPLEMENTATION_ROADMAP.md`, then inspect the current repository.
2. Implement only the smallest coherent vertical slice for the active phase.
3. Keep every change buildable and testable. Do not leave broken scaffolding
   behind for a future phase.
4. Before claiming completion, run the required checks for that phase and report
   their exact commands and results.
5. Do not bypass failures with `--force`, `--ignore-scripts`, `|| true`,
   `allow_failure`, disabled tests, catch-all fallbacks, or weakened security.

## Fail-closed delivery policy — mandatory

The agent has full access to this trusted local repository, but full access is
not permission to hide, bypass, overwrite, or dilute failures. Diagnose the root
cause and apply the smallest durable, documented fix that preserves the required
architecture and production behaviour.

The following are forbidden unless the Product Owner explicitly approves an ADR
that names the reason, impact, alternative, rollback plan, and verification:

- `--force`, `--ignore-scripts`, `--no-verify`, `--legacy-peer-deps`, or any
  equivalent install/build/test bypass;
- `|| true`, swallowed exit codes, `allow_failure`, skipped/disabled tests,
  empty catch blocks, fake mocks that replace a required integration, or reduced
  assertions made only to turn a gate green;
- replacing a mandated dependency, version, package manager, database feature,
  security control, or URL rule with a fallback implementation;
- changing `node-linker`, hoisting, peer-dependency, lockfile, registry, or
  package-manager settings merely to conceal an installation or compatibility
  error;
- deleting, resetting, overwriting, regenerating, or reinitializing existing
  user work to obtain a clean state without first inspecting and reporting the
  exact target and preserving unrelated changes;
- committing generated artifacts, secrets, `.env` files, local caches, or a
  lockfile produced by a failed/incomplete installation.

For a filesystem privilege or platform prerequisite failure, such as inability
to create a Windows symbolic link, stop the affected gate and report the exact
error, command, environment, and supported prerequisite. Do not replace the
required package-manager behaviour with a symlink-free workaround. After the
prerequisite is corrected, repeat the affected operation from a clean,
documented state and retain the successful evidence.

Any proposed fallback must be presented before implementation with: root cause,
why the primary path cannot work, exact scope, security/data/production impact,
test plan, and a required ADR approval. "Make it pass" is never sufficient
justification.

## Required architecture

- Use a modular monolith. Keep delivery, application, domain, and infrastructure
  layers separate. Domain code must not depend on Next.js, Prisma, transport, or
  OIDC SDKs.
- Use a monorepo with `apps/web`, `apps/worker`, `packages/domain`,
  `packages/application`, `packages/infrastructure`, `packages/contracts`,
  `packages/ui`, `infra`, and `docs` unless an ADR approves a different layout.
- Use TypeScript strict mode. Validate all external input at the delivery
  boundary. Use typed domain errors and map them to RFC 9457 Problem Details.
- PostgreSQL is the source of truth. Use Prisma migrations, never `prisma db push`
  in shared or production environments.
- Use transactions for state changes that also create audit events, outbox records,
  redirects, or route history.

## Version baseline — mandatory for bootstrap

Pin and commit the exact dependency graph in `pnpm-lock.yaml`; never use floating
versions in `package.json` for runtime or build tooling.

| Component | Required baseline | Rule |
| --- | --- | --- |
| Node.js | `24.18.1` exactly | Pin the exact runtime in the repository and CI |
| Node.js type declarations | `@types/node@24.13.3` exactly | Match the Node 24 runtime major; never use newer-major API declarations |
| Package manager | `pnpm@12.0.0-beta.2` | Activate through Corepack; set `packageManager` exactly |
| Next.js | `16.2.12` | Verify the package exists before scaffolding; do not silently downgrade |
| React / React DOM | Latest stable React `19.2.x` patch | Resolve once, then pin the exact patch and types |
| TypeScript | `7.0.2` | Use the native TypeScript compiler and strict mode |

At the start of Phase 0, validate each requested version from the package registry
and record the resolved versions in `package.json`, `pnpm-lock.yaml`, and the
bootstrap report. Enforce Node.js `24.18.1` through `engines`, the selected
runtime-version file, and CI. Add `@types/node@24.13.3` as an exact root
devDependency; its major must remain aligned with the Node runtime major. If
`next@16.2.12` is unavailable, stop and report that fact;
the approved alternative must be an explicit Product Owner decision, not an
automatic fallback. Before dependency installation, assess peer-dependency and
tooling compatibility with TypeScript 7 and pnpm 12 beta. The beta package manager
must be treated as a tracked delivery risk with a reproducible clean-install CI
gate.

## Public URL and localization policy — mandatory

## Search visibility — highest public-site priority

The mandatory Google Search Console and Yandex Webmaster operating contract is
[`docs/runbooks/search-visibility.md`](docs/runbooks/search-visibility.md).
For every public-route, content, metadata, or deployment change, preserve its
canonical, indexation, sitemap, robots, hreflang, structured-data, performance,
and monitoring rules. Legitimate search quality is required; cloaking, keyword
stuffing, doorway pages, hidden text/links, deceptive redirects, and artificial
link schemes are forbidden.
Google AI features require no special AI markup or text file beyond normal
indexability and helpful people-first content. Google ignores `llms.txt` and
similar AI files for Search visibility. `llms.txt`/`ai.txt` may only be a
separately approved, public, reviewed compatibility layer; never present them
as an SEO control. WebMCP and Lighthouse Agentic Browsing are experimental and
require separate authorization before enablement.

SEO delivery requirements:

- Build and maintain the semantic/content backlog outside Git for each locale:
  audience segment, pain point, query cluster, intent, canonical target URL,
  evidence source, owner, priority, CTA, and internal-link plan.
- Prioritize commercial categories/products and trust pages first; then
  industry/problem/FAQ pages; then comparisons, cases, guides and tools. No
  page quota, forced word count, translated keyword list, or mass generation
  substitutes for verified local demand and useful original content.
- Each indexable page requires a canonical 200 URL, server-rendered primary
  content/links, at least one internal incoming link, correct locale metadata,
  and sitemap eligibility. Filters are indexable only by explicit reviewed
  demand/content decision; no client-only crawl workaround or `nofollow`
  blanket policy.
- Quote-only “from” prices are never schema `Offer`/`AggregateOffer`. FAQPage
  is emitted only for visible maintained FAQs and is not a rich-result or AI
  inclusion promise.
- Quote-only products may emit factual `Product` identity schema (name,
  description, image, SKU/public ID and brand) but omit `offers` and any price
  specification until a real public offer exists. Perform a quarterly
  evidence-led content-quality review; do not use word-count quotas as a proxy
  for quality or mass-publish pages without editorial review.
- IndexNow is a P1, secret-managed notification adapter for Bing/Yandex only;
  it never replaces sitemap/canonical correctness and is never used as a Google
  indexing mechanism.
- Treat traffic, rank, indexing speed, conversion rate and AI Overview presence
  as monitored forecasts, not release gates or guarantees. The release gate is
  verified technical indexability, P0 content, consent-aware analytics, and
  post-release monitoring.
- Technical SEO is automatic and data-driven. A publication, unpublication,
  translation, localized-slug, public-asset, route-history or SEO-field state
  change must regenerate affected canonical URLs, metadata, Open Graph,
  hreflang/x-default, robots, JSON-LD, sitemap membership/`lastmod`, cache tags
  and eligible IndexNow notification. Manual per-page sitemap, metadata or
  schema editing is forbidden.
- Automation fails closed: unpublished, incomplete, invalid, private,
  non-canonical or non-indexable records never emit public metadata, sitemap
  data, schema or IndexNow notifications. Human review confirms facts that code
  cannot infer: language quality, technical claims, images, certificates,
  approved offers and editorial usefulness.
- Every automatic public behavior has an authorized, audited control surface in
  admin settings. The Product Owner must be able to configure the public base
  URL/host policy, locale availability/default and language routing, SEO
  defaults/templates, indexation eligibility, canonical/redirect policy,
  sitemap inclusion, organization/NAP/social data, analytics consent and IDs,
  Search Console/Yandex/Bing/IndexNow integration state, and feature flags.
  Settings validate before save, show an effective preview/diff, retain history
  with actor/time/reason, use least privilege, and never expose secrets.
- Generate image/video sitemap extensions from eligible public media. Keep
  Google Business Profile synchronized only with approved real business facts.
  Merchant Center/product feeds are conditional on accurate public offers and
  must never use the MVP's quote-only/indicative prices. Crawler and snippet
  controls require explicit audited settings and preview; Google-Extended is
  independent of Google Search and AI Overview eligibility.
- Prepare the domain and admin model for a future Merchant Center/direct-sale
  mode now, without enabling it for quote-only products. A sellable offer is a
  separate, versioned commercial record with exact tax/currency price,
  availability, seller, condition, product identifiers, delivery regions/costs,
  return policy, effective dates and checkout eligibility. Publishing or
  changing an offer is validated, audited and synchronized to visible page
  content, Product/Merchant structured data, the Merchant feed and the actual
  checkout. If any required fact is missing or stale, the offer is excluded from
  all merchant output and the product remains quote-only.
- Instrument a privacy-safe product-interest event model from the first public
  release. Capture anonymous/consented session and aggregate analytics for page
  and product impressions, category views, search terms, filters, sort, media
  and document views/downloads, internal-link/CTA/call clicks, comparison and
  calculator use, language switch, quote/cart/checkout funnel steps, purchase
  when enabled, and error/empty-result states. Events use stable IDs and locale
  rather than raw personal data; never send credentials, tokens, full form
  values, payment data, precise sensitive profiling or unnecessary PII.
- Product analytics, heatmaps and session-behavior analysis are owned by the
  separate Rust first-party analytics service (Matomo-class). EraMix integrates
  through a versioned, consent-gated analytics contract/adapter. GA4 and Yandex
  Metrica remain supported web-analytics destinations for acquisition,
  advertising and cross-platform reporting; all three receive the same approved
  semantic events subject to consent. The Rust service owns first-party storage,
  heatmap/replay implementation, retention and detailed behavior reporting;
  EraMix owns event semantics, consent enforcement, minimization, identity
  boundaries and non-blocking delivery.
- The Rust analytics service is a planned integration and must not block MVP
  release before its team supplies a stable contract (currently expected no
  earlier than October 2026). Prepare its adapter boundary, schemas, fixtures,
  feature flag, health checks and disabled-by-default configuration now; do not
  invent an endpoint, credentials or substitute service. GA4, Yandex Metrica,
  advertising and Search adapters continue independently.
- Build a governed comparison layer for Rust analytics, GA4, Yandex Metrica,
  advertising platforms, Search Console and Yandex Webmaster. It defines metric
  meaning, attribution window, timezone, currency, consent/sampling coverage,
  freshness and reconciliation rules. Dashboards show source-native and
  normalized comparisons beside discrepancies; never silently merge
  incompatible counts into one "truth" number.
- Implement an advertising-integration control plane for approved providers:
  Google Ads, Yandex Direct, Microsoft Ads, Meta, LinkedIn, TikTok and
  future providers through typed adapters. Admin controls provider enablement,
  consent category, account/container/pixel identifiers, conversion mapping,
  attribution/UTM rules, server-side conversion state, diagnostic health and
  emergency disablement. It may never inject arbitrary vendor JavaScript,
  expose access tokens, alter canonical SEO output, or send personal/form/
  payment data without the required consent and lawful integration contract.

Supported MVP locales are `ru`, `en`, and `uz`; `en` is the default locale.
Locale is the first segment of every indexable public URL and must match the
translation being served. Configure `next-intl` with `localePrefix: 'always'`
and `localeDetection: true`: an unprefixed entry URL is redirected by the
visitor's `Accept-Language` preference to the appropriate prefixed URL, while
an explicit locale prefix always wins.

| Resource | Canonical URL | Resolution rule |
| --- | --- | --- |
| Article | `/{locale}/articles/{localizedSlug}` | slug and history route |
| CMS page | `/{locale}/pages/{localizedSlug}` | slug and history route |
| Category | `/{locale}/catalog/{localizedSlug}` | localized category route |
| Product | `/{locale}/catalog/{publicId}-{localizedSlug}` | resolve by `publicId`; mismatched slug redirects |
| Order | `/{locale}/account/orders/{orderNumber}` | protected route; authorization required |

Never persist a concatenated `id-slug` value as a database identifier. Internal
`id`, public `publicId`/`orderNumber`, locale, and localized slug are separate
fields.

For articles/pages/categories, retain current and historical routes. A prior
published slug must return a single `308` redirect to the current canonical URL;
it must never be reused while the route is retained. Product history is not
required because the immutable `publicId` resolves the product.

Use a single typed URL builder for UI, API, metadata, sitemap, email, JSON-LD,
and tests. Hand-built public URL strings are forbidden outside that package.

Every published translation must provide self-canonical, `hreflang` links for
available translations, and `x-default`. Sitemap contains canonical published
routes only. Missing translations must be explicit (404 or language selector),
never a fallback page rendered under the wrong locale URL.

## Security and identity

- Authenticate only through ODS Identity using OIDC Authorization Code Flow with
  PKCE. Validate issuer, audience, signature, expiration, nonce, state, and JWKS
  rotation.
- Store session credentials in secure, HttpOnly, appropriately SameSite cookies.
  Browser JavaScript must not access access or refresh tokens.
- Enforce permissions on the server for every protected use case. Hidden UI is
  not authorization.
- Apply rate limits to authentication, search, order submission, uploads, and
  admin operations. Never log credentials, tokens, or unnecessary PII.

## Environment configuration and secrets

- Application, domain, application-layer, and UI code read configuration
  exclusively through `packages/infrastructure/src/env.ts`'s validated
  `loadEnv()`/`process.env`. No domain, application, UI, or business code may
  import `dotenv` or `@dotenvx/dotenvx`.
- `dotenvx` (`@dotenvx/dotenvx`, exact-pinned, `docs/adr/0016-dotenvx-environment-workflow.md`)
  is the standard local-developer/CI environment-file launcher — invoked only
  as a CLI wrapper (`dotenvx run -f … -- <command>`) inside `package.json`
  `scripts`, never imported programmatically. It is a launch-time
  convenience only; it never becomes a second source of truth for a real
  secret.
- The production/staging secret store is always authoritative. CI sources
  real values from GitHub Actions secrets/environment variables (never a
  `.env` file); Docker/deployment sources them from the deployment
  platform's secret store, injected as container env vars at start, never
  baked into an image layer.
- Never commit a plaintext `.env`, `.env.local`, `.env.production`,
  `.env.keys`, or any other secret-bearing local environment file.
  `.env.keys` (and any `.env.*.keys`) must never be committed, copied into a
  container, printed, or logged — enforced by `.gitignore`, `.dockerignore`,
  and the CI `security` job's `dotenvx precommit`/`dotenvx prebuild` gates.
- An encrypted `.env.<environment>` may only be committed after an explicit
  Product Owner/security decision (see ADR-0016's "future encrypted-env
  workflow"); its matching private key belongs only in the approved CI/VPS
  secret store.

## Data, content, and ordering invariants

- PostgreSQL `19beta2` is the mandatory version for local, CI, staging, and
  the explicitly approved initial production deployment. Do not silently fall
  back to PostgreSQL 17 or 18.
- PostgreSQL 19 beta in production is an explicit Product Owner risk acceptance.
  Pin the exact container image digest; perform a successful backup/restore and
  migration rehearsal before production use; monitor PostgreSQL beta release
  notes and regressions. The upgrade to PostgreSQL 19 GA is a separate planned
  production change: rehearse the supported upgrade path, preserve rollback
  evidence, and require an explicit deployment authorization when GA is
  available. Never auto-upgrade a production database merely because GA ships.
- `ContentTranslation` and `ProductTranslation` are unique per parent and locale.
- A route is globally unique for its route namespace and locale. Each published
  translation has exactly one canonical route, enforced by a PostgreSQL partial
  unique index.
- Slug changes are explicit commands, not side effects of title changes. Normalize
  slug input; reject empty values, control characters, path separators, query or
  fragment characters, dot segments, encoded separators, and reserved slugs.
- Public products have immutable, cryptographically random `publicId` values and
  unique SKU values. Never expose internal UUIDs as public URLs by default.
- Order state transitions run through the state machine, are authorized, audited,
  and idempotent where applicable. Order line snapshots do not change when
  catalog data changes.
- Use a transactional outbox for notifications and externally visible asynchronous
  effects.

## Observability and operations

- Instrument traces, metrics, and structured JSON logs with OpenTelemetry and
  export via OTLP Collector. Use W3C Trace Context; use RFC 5424 only as a
  Collector-to-Syslog/SIEM export format.
- Include trace correlation without placing PII, secrets, or arbitrary URL
  payloads into telemetry.
- Provide liveness/readiness endpoints, dashboards/alerts for critical paths,
  backup/restore procedures, and runbooks before production promotion.

## Quality gates

For each changed package, run the applicable formatter, lint, typecheck, unit,
integration, contract, and E2E tests. Before a release, all mandatory CI gates
must be green: source quality, OpenAPI/schema validation, migrations, security
scans, production build, accessibility/performance smoke, deployment smoke, and
the required E2E scenarios.

Use test names that describe externally observable behaviour. Add regression
tests for every defect and every URL/redirect edge case.

### Temporary TypeScript-eslint compatibility exception

TypeScript `7.0.2` is mandatory and must not be downgraded to satisfy a linter.
Run `tsc --noEmit`/the workspace typecheck on every change; TypeScript compiler
checks, tests, builds, formatting, security checks, and all other applicable
gates remain mandatory.

First attempt the latest stable `typescript-eslint` with TypeScript `7.0.2` and
record its exact supported-version result. If its upstream support window rejects
TypeScript 7, it is permitted to temporarily disable only the TypeScript-specific
ESLint parser/plugin integration. Do not suppress the warning, spoof support, or
disable the whole lint/typecheck gate. Keep ESLint for supported non-TypeScript
files and retain formatting plus strict TypeScript compiler checks for `.ts` and
`.tsx` files.

This exception requires an ADR that records the package/version evidence, exact
rules temporarily unavailable, affected scope, verification retained, owner, and
an automated or scheduled review when upstream TypeScript 7 support lands. Restore
the TypeScript-eslint integration and its strict rules in the first compatible
maintenance change.

## Change management

Create an ADR before changing the modular-monolith boundaries, identity profile,
public URL grammar, localization strategy, persistence model, public API version,
or observability pipeline. Do not make destructive data changes without a tested
backup and rollback/forward-fix plan.

When a phase is complete, update `docs/IMPLEMENTATION_ROADMAP.md` with completed
evidence rather than merely checking items off by assumption.
