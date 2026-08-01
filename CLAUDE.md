# EraMix implementation instructions

## Mission and source of truth

Implement the EraMix B2B MVP incrementally, with production-quality contracts
and verification at every phase. The authoritative product and engineering
requirements are in:

- `docs/EraMix_Полное_техническое_задание_MVP_v1.1.docx`
- `docs/IMPLEMENTATION_ROADMAP.md`

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

Supported MVP locales are `ru`, `tt`, `en`, and `uz`. Locale is the first segment
of every indexable public URL and must match the translation being served.

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

## Data, content, and ordering invariants

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
