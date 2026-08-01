# ADR-0010: Localization strategy — translation entities, slug-only content URLs, publicId-slug product URLs

- Status: Accepted (in TZ v1.1)
- Date: 2026-08-01
- Requirement source: TZ v1.1 Appendix F (URL architecture and slug
  lifecycle), Appendix D (ADR-010, "Принято в ТЗ v1.1; оформить ADR при
  scaffold")

## Context

TZ v1.1 already made this decision in Appendix F; this ADR is the formal
record requested by the ADR backlog at scaffold time, and the single
reference point CLAUDE.md's "Public URL and localization policy" section is
derived from.

## Decision

- Supported MVP locales: `ru`, `tt`, `en`, `uz` (fixed allowlist; encoded as
  `packages/domain`'s `LocaleCode`/`SUPPORTED_LOCALES`).
- Locale is the first path segment of every indexable public URL and must
  match the translation actually served; a missing translation is either a
  404 or an explicit language selector, never a silent fallback rendered
  under the wrong locale's URL.
- Content (Article, Page) and Category use **slug-only canonical URLs** per
  locale, with route history retained: a prior published slug 308-redirects
  once to the current canonical URL and is never reused while retained.
- Product uses an **immutable `publicId` + localized slug** URL
  (`/{locale}/catalog/{publicId}-{localizedSlug}`); resolution is always by
  `publicId`, and a mismatched slug redirects rather than 404s. Product
  history is not required because `publicId` alone resolves the product.
- `id` (internal), `publicId`/`orderNumber` (public, immutable), `locale`,
  and `localizedSlug` are always separate fields — never a concatenated
  `id-slug` column.
- Exactly one canonical route per published translation, enforced by a
  PostgreSQL partial unique index (`WHERE is_canonical = true`), and
  `UNIQUE(content_id, locale)` / `UNIQUE(product_id, locale)` on the
  translation tables (DB-007, DB-008, index minimum §13.1).
- All public URLs are produced by a single typed URL-builder package; no
  public URL is hand-composed elsewhere (UI, API, metadata, sitemap, email,
  JSON-LD, tests all route through it).

## Consequences

- Phase 1 must ship `Content`/`ContentTranslation`/`ContentRoute` and
  `Product`/`ProductTranslation` with these constraints from the first
  migration; retrofitting the partial unique index after data exists is
  materially harder.
- Phase 2 owns the URL-builder package and route-resolution/redirect logic;
  Phase 3+ UI, sitemap, and metadata code must import it rather than
  constructing paths inline.
- `packages/domain`'s locale allowlist (already scaffolded in Phase 0) is the
  single source of truth other layers validate against; adding a fifth
  locale is a domain-layer change plus a content/translation rollout
  decision, not a routing-layer patch.
