# Search visibility runbook: Google Search Console and Yandex Webmaster

## Scope and operating rule

This is the mandatory launch and operations contract for organic search. It
implements legitimate technical SEO; it does not promise positions, bypass
ranking systems, or authorize deceptive optimisation.

Sustainable qualified organic traffic, conversion, sales enablement, and
measurement are the highest business priority this runbook serves (see
CLAUDE.md's "Business priority and decision rule"). Decision rule: when
several compliant options exist, choose the one that maximizes qualified
organic traffic, conversion, measurement quality, and durable search
visibility.

The Product Owner owns Google Search Console and Yandex Webmaster access.
Credentials, verification tokens, OAuth refresh tokens, and exported query data
are secrets: use the deployment secret store, never source control or logs.

## Automatic SEO generation contract

Technical SEO is generated from the authoritative published content model, not
by manually editing per-page HTML, XML, JSON-LD, `robots.txt`, or webmaster
tools.

- One typed SEO/URL service is the only producer of public canonical URLs,
  metadata, Open Graph, hreflang/x-default, robots directives, JSON-LD,
  sitemap entries, `lastmod`, and public route links. Every caller uses the
  same URL builder.
- Publication, unpublication, translation change, localized-slug change,
  public-asset change, route-history change, or SEO-field change deterministically
  regenerates affected SEO output and cache tags. IndexNow is scheduled only
  for an eligible canonical URL after the public state commits.
- Sitemaps are dynamically generated from published canonical data, partitioned
  by type/locale and never hand-edited. `lastmod` reflects the relevant content
  or SEO change, never a deploy/crawler timestamp.
- `robots.txt` is generated from the route/indexation policy and canonical host.
  It is deterministic across replicas and cannot expose staging, preview,
  private, account, admin, API, cart, action or draft routes.
- Missing publication fields fail the publication validation. The system must
  never silently produce a weak fallback title, wrong-language content,
  fabricated offer, empty schema object or sitemap entry.
- Lifecycle tests cover draft → publish → update → slug/translation change →
  unpublish/remove, asserting metadata, XML, redirects, JSON-LD, cache tags,
  robots eligibility and the IndexNow boundary.
- Human review is required for facts automation cannot truthfully infer:
  native-language quality, technical claims, images, certificates,
  author/reviewer attribution, public price/availability and editorial value.
  Automation never invents or translates these facts for publication.

### Settings, controls and recovery

The Product Owner operates SEO through authorized settings and operational
views, not by editing generated output per URL or entering production
containers.

| Control                                                                                                    | Who may change it                      | Required safeguards                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Canonical public host, HTTPS/host redirect and trailing-slash policy                                       | Product Owner / platform administrator | Deployment-host validation, staged preview, explicit confirmation and audit trail.                                |
| Locale availability/default, language detection and `x-default`                                            | Product Owner / content administrator  | Block removal while published routes exist; list affected URLs before save.                                       |
| Page-type SEO defaults/templates and Open Graph fallback assets                                            | Content administrator                  | Per-locale effective preview, content validation, revision history and no cross-locale fallback.                  |
| Entity SEO fields, indexability and sitemap eligibility                                                    | Content administrator                  | Publication validation, rendered metadata/JSON-LD/sitemap preview, audit event and rollback.                      |
| Organization/NAP/social/certificate/author facts                                                           | Product Owner / authorized editor      | Public preview, factual evidence and expiry validation where relevant.                                            |
| Rust analytics service, GA4 and Yandex Metrica consent mode/identifiers                                    | Product Owner / privacy administrator  | Secret/ID separation, consent-gated preview, provider parity and no PII payloads.                                 |
| Search Console, Yandex, Bing and IndexNow integration state                                                | Product Owner / platform administrator | Secret-store references, connection health, test notification, disable switch and redacted error log.             |
| Search preview/crawler controls (`noindex`, `nosnippet`, `max-snippet`, `data-nosnippet`, Google-Extended) | Product Owner / authorized editor      | Entity/template preview, explicit impact warning, audit trail and no accidental Search block.                     |
| Image/video sitemap extensions and rich-media eligibility                                                  | Content administrator                  | Public-asset, rights, dimensions, locale and visibility validation; regenerate only for eligible canonical pages. |
| Google Business Profile / Merchant Center connection state                                                 | Product Owner only                     | Verified business facts; Merchant Center only for real public purchasable offers, never quote-only prices.        |
| AI compatibility files and experimental agentic features                                                   | Product Owner only                     | Explicit approval, public-content preview, owner/review date and immediate disable switch.                        |

- Settings have typed schemas, server-side RBAC, CSRF protection, optimistic
  concurrency, audit/outbox events, change reason, history and rollback. A
  failed save can never partially alter generated output.
- Admin provides read-only live views for generated `robots.txt`, sitemap
  membership/counts, canonical/redirect resolution, hreflang cluster, rendered
  metadata/JSON-LD, indexation reason, integration health and the last IndexNow
  delivery result. These views are not editable artifacts.
- Emergency disable controls stop future external notifications or experimental
  files immediately. They never delete public routes or bypass publication and
  audit rules.

### Search-surface extensions

- Generate image sitemap entries for eligible public product/content images and
  video sitemap entries/`VideoObject` only for real public videos. Extensions
  are derived from the canonical public page and media visibility model; they
  never substitute for visible captions, useful alt text or fast media delivery.
- Keep a verified Google Business Profile synchronized with the same approved
  Organization/LocalBusiness facts when EraMix has a real eligible local
  business presence.
- Merchant Center/product-feed integration is conditional, not an SEO shortcut:
  enable it only after accurate public price, availability, delivery and seller
  facts exist. The current quote-only/indicative price model is ineligible for
  fabricated feed or offer data.
- Prepare direct-sale/Merchant Center capability as a separate commercial mode,
  not as an overload of the current quote-only `ProductTranslation` price. A
  sellable offer requires a versioned, effective-dated source of truth for
  exact price and currency, tax display policy, availability, condition,
  seller, GTIN/MPN/brand/SKU identifiers, delivery regions/costs/times, return
  policy, landing-page URL and actual checkout eligibility. Each value is shown
  consistently on the page, in markup and in the Merchant feed.
- The direct-sale launch sequence is: (1) model and admin controls; (2) secure
  checkout/order/payment/fulfilment and legal policy; (3) feed generation and
  schema; (4) Merchant Center verification/diagnostics; (5) limited approved
  product rollout; (6) monitoring, reconciliation and rollback. A failed or
  stale validation excludes the offer from Merchant output while preserving the
  product's ordinary quote-request page.
- Merchant settings must control catalog/feed enablement, eligible countries and
  locales, currency/tax display, shipping and returns policy references,
  diagnostics threshold, manual override/review, synchronization schedule and
  immediate disablement. The public Merchant feed is generated automatically;
  admins never edit feed rows manually.
- **Status, 2026-08-03 (ADR-0019)**: launch-sequence step (1) — the versioned
  `Offer` model, admin controls, and RBAC-protected `/admin/offers` UI — is
  built. A deterministic feed generator and Product/Merchant JSON-LD
  generator exist (step 3, in preview form only, via the RBAC-protected
  `GET /api/admin/offers/feed-preview`), but emit real output to no public
  route: `PlatformSettings.merchantCenterEnabled` stays hard-rejected at
  write time, so every offer is provably always excluded from any feed
  today. Steps (2) secure checkout/legal, (4) Merchant Center verification,
  (5) rollout, and (6) monitoring/reconciliation remain entirely
  unstarted — this status is prepared but disabled pending a real checkout,
  verified seller/policies, exact public offer facts, and explicit Product
  Owner approval.
- Default crawler/snippet policy is maximum legitimate Search eligibility.
  Restrictive directives require an explicit documented reason and preview.
  Google-Extended is independent of Google Search crawling and must not be
  confused with AI Overviews/AI Mode eligibility.

## URL, crawl, and indexation policy

- Every indexable page has one absolute HTTPS canonical URL, a self-referencing
  `rel=canonical`, canonical internal links, and inclusion only in the matching
  sitemap.
- Permanent duplicate/history URL changes use a direct server-side `308`.
  Canonical, redirect, sitemap, and internal-link signals must agree.
- `robots.txt` manages crawl traffic, not confidentiality or removal from search.
  Private pages require authentication; non-indexable but crawlable HTML uses
  `noindex`; permanently removed content returns `404` or `410`.
- Never block a page in `robots.txt` merely to remove it from results: Google and
  Yandex can still discover a blocked URL without reading its `noindex`.
- Admin, account, auth, API, preview, internal search, cart/action, draft,
  archived, and private-document routes are not indexable and never enter a
  sitemap.
- Public routes use locales `ru`, `en`, `uz`; every published translation has a
  same-language self-canonical and a complete reciprocal hreflang cluster.
  `x-default` points to the English canonical URL. An absent translation is not
  substituted with a different locale.

## Demand-led content architecture

- Build the semantic map around four B2B audiences: procurement teams
  (commercial supply intent), engineers/technologists (specification and
  compatibility), decision makers (solution and ROI), and operators
  (operation, standards, and troubleshooting).
- Prioritize pages in this order: **P0** home, revenue-critical category and
  subcategory pages, flagship product pages, company/trust/contact pages;
  **P1** industry solutions, comparisons, certificates and documentation;
  **P2** original knowledge base, cases, selectors, and calculators. A page
  enters the backlog with its target query cluster, locale, intent, evidence
  source, owner, CTA, and internal-link plan.
- Capture early-funnel demand through genuinely useful problem/solution,
  selection, comparison, standards, maintenance, and implementation content.
  Each article must answer the real task and lead naturally to the relevant
  category, product, solution, or engineering consultation; it is not a
  doorway page for a keyword variation.
- One engineering entity has one canonical landing page. Closely matching
  models should use documented variants/modifications instead of duplicate
  pages. Do not impose a word-count minimum: usefulness, accurate technical
  data, unique evidence, and completeness for the intent decide publication.
- A programmatic category/brand/industry/filter landing page is indexable only
  after an SEO owner documents distinct intent, meaningful demand or an
  established business use case, sufficient relevant inventory/content,
  unique human-reviewed copy and metadata, and internal links. Otherwise it
  remains unlinked/noindex or is not created. This rule prohibits fan-out,
  thin inventory, and mass-generated pages.
- The SEO lead maintains a semantic backlog outside Git: segment, pain point,
  seed query, locale, intent, target canonical URL, priority, evidence source,
  content owner and planned CTA. It must be built independently for `ru`, `en`
  and `uz`; translated keyword lists do not establish local demand.
- The initial production target is a capacity plan, not a publishing quota:
  first commercial categories and products, then industry/FAQ/problem pages,
  then comparisons, cases, guides and tools. Do not multiply every page into
  three languages before a native reviewer and the relevant commercial facts
  are available.
- Run a quarterly content-quality review from Search Console, Webmaster,
  analytics and editorial evidence. Pages with no distinct intent, inadequate
  factual value, persistent thin content or no useful demand are improved,
  consolidated, noindexed, redirected only to a true successor, or removed.
  Do not use an arbitrary word-count threshold as the decision rule.
- A bulk publication above ten new indexable pages requires an editorial sample
  review before release and automated checks on the whole batch. The review
  confirms distinct intent, locale quality, factual claims, metadata and
  internal-link eligibility; it is not a permission to mass-generate pages.

## Public page and conversion contract

- Product pages expose visible model/SKU, technical characteristics, real
  images with useful alt text, applicable documents/certificates, compatible
  equipment or alternatives, truthful indicative "from" price when approved,
  and a request-for-quotation CTA. A final contractual price is always
  confirmed by a manager from the buyer's requirements.
- Category and solution pages explain selection/application context, link to
  subcategories/products, and may include visible FAQ only where answers are
  maintained. Articles and comparisons identify their qualified author or
  reviewer and cite primary technical standards/manufacturer documentation
  where relevant.
- Measure `rfq_submit` as the primary organic conversion. Also measure
  documented downloads, CAD/DWG requests, telephone/email/messenger clicks,
  and language switching with consent-aware analytics. Never gate a publicly
  promised technical document merely to fabricate a lead; where lead capture
  is used, disclose the purpose and follow the applicable privacy rules.
- Every indexable page must have at least one crawlable internal incoming link.
  Product-to-guide and guide-to-product links are based on true selection or
  application relevance, not forced exact-match anchors. Breadcrumbs, related
  content and footer navigation are server-rendered ordinary links.
- Retired products return `410` only when permanently unavailable with no
  useful successor; a `308` is used only for a materially equivalent canonical
  replacement (matching this contract's other permanent-redirect uses — see
  "Permanent duplicate/history URL changes use a direct server-side `308`"
  above). Never redirect removed products indiscriminately to a category.

## Implementation and acceptance matrix

| Priority    | Requirement                                                                                                                                                                                               | Acceptance evidence                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P0          | Locale-aware canonical URLs use the repository URL builder and the approved `/{locale}/{type}/{publicId}-{localizedSlug}` product pattern.                                                                | Unit/integration tests cover current route, stale slug, route history, one-hop redirect, missing translation, 404 and 410.               |
| P0          | The Product Owner can inspect and control all SEO automation through authorized settings, preview and operational views.                                                                                  | RBAC, validation, concurrency, audit-history/rollback, secret redaction, effective-output preview and emergency-disable tests are green. |
| P0          | `ru`, `en`, and `uz` have direct HTML language links to the same entity; `en` is `x-default`; published alternates are reciprocal, canonical and `200`.                                                   | Automated metadata/sitemap test plus live inspection of every public template.                                                           |
| P0          | Public product, category, guide, solution, comparison, case, FAQ, trust and contact templates are server/static rendered with meaningful primary text and ordinary links.                                 | Browser response inspection with JavaScript disabled or server HTML inspection; no indexable template is orphaned.                       |
| P0          | `robots.txt`, sitemap index and locale/type sitemaps are public, valid, host-correct and contain only published canonical HTTPS `200` URLs.                                                               | Automated XML/HTTP checks and accepted submissions in Search Console and Yandex Webmaster.                                               |
| P0          | Metadata is per-translation: title, description, H1, canonical, robots, Open Graph, language and appropriate visible JSON-LD.                                                                             | Template tests plus Rich Results Test/Yandex validator for representative live URLs.                                                     |
| P0          | Quote-only pricing stays visibly non-binding and is not `Offer` markup; images, technical data, documents and claims are factual and visible.                                                             | Content publication validation and structured-data test.                                                                                 |
| P0          | Commercial conversion is measurable without leaking PII: request-for-quotation, product/category views and phone calls have documented, consent-aware events.                                             | Rust analytics-service contract/debug evidence plus advertising-conversion test evidence from representative public flows.               |
| P0          | HTTPS, canonical host, HSTS (after TLS is verified), redirect behavior, custom 404, and permanent-removal `410` behavior are correct.                                                                     | HTTP response matrix for `http/https`, host variants, trailing-slash policy, old routes, 404 and 410.                                    |
| P1          | Demand-approved SEO filter landing pages have server rendering, a distinct URL, inventory, intent, metadata and content; utility filter/sort/search variants remain noindex.                              | Crawl report shows bounded query surface and no accidental indexable filter fan-out.                                                     |
| P1          | Contextual links, related products/content, breadcrumbs, industry pages, comparisons, cases and native-reviewed translations are authored from the semantic backlog.                                      | Crawl report has no orphaned canonical page; editorial review sample for each locale.                                                    |
| P1          | IndexNow sends only canonical changed URLs to Bing/Yandex after a successful public state change.                                                                                                         | Integration tests, secret-store configuration review, verification-key endpoint and bounded error telemetry.                             |
| P1          | Technical documents have a declared publication policy: index only unique public documents with search value; otherwise serve an appropriate noindex/private-download policy.                             | Header/robots and sitemap tests for document routes; no accidental private document indexing.                                            |
| P1          | Organization/LocalBusiness, certificates, author/reviewer, standards and contact data are published only when real and maintained.                                                                        | Business owner approval and JSON-LD/content parity inspection.                                                                           |
| P2          | Video, `VideoObject`, web manifest, social-card variants, optional public AI compatibility files and experimental agentic diagnostics are added only when their factual owner and maintenance plan exist. | Feature-specific tests and explicit Product Owner approval where required.                                                               |
| P1          | Eligible public images and videos are discoverable through automatically generated sitemap extensions and visible page media.                                                                             | XML/JSON-LD/media visibility tests; no private, duplicate or unlicensed asset appears.                                                   |
| Conditional | Google Business Profile and Merchant Center use the exact approved business/product facts.                                                                                                                | Business Profile verification; Merchant feed enabled only with validated real offers, never quote-only indications.                      |

### Required external working artifacts

These artifacts are maintained by the SEO/business team outside source control;
their presence is a launch prerequisite, but credentials, raw queries, customer
data and exports are never committed:

1. Semantic backlog by locale/segment/intent/canonical URL/owner/CTA.
2. Native-review and factual-evidence workflow for `ru`, `en`, and `uz`.
3. Content calendar and production capacity plan; it may set targets but cannot
   force thin or invented pages.
4. Search Console, Yandex Webmaster and Bing Webmaster ownership/verification
   record, sitemap submission evidence and access-owner list.
5. Consent, privacy and analytics-event specification; dashboard for organic
   sessions, qualified RFQs, coverage, errors and Core Web Vitals.

## Interest, behavior and conversion analytics

Analytics is automatic, schema-versioned and generated by a shared event
library. The separate Rust first-party analytics service (Matomo-class) owns
collection/storage, heatmaps, session-behavior analysis and detailed reporting.
GA4 and Yandex Metrica remain enabled destinations for acquisition/advertising
measurement and cross-platform reporting. EraMix supplies the consent-gated,
minimized common event contract; it is not a hidden profiling or data-
exfiltration mechanism.

The Rust service is a future integration, currently not expected to provide a
stable contract before October 2026. It is disabled by default and must not
delay public launch, SEO, GA4, Yandex Metrica or advertising integrations.
Prepare only its typed adapter boundary, schemas, fixtures, feature flag,
health/diagnostic contract and admin configuration. Do not invent an endpoint,
credentials, event delivery behavior or a replacement service.

| Event family       | Required signals                                                                                                 | Required dimensions                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Discovery          | page view, landing/referrer class, campaign attribution, locale, canonical route                                 | anonymous/consented session ID, page type, entity ID, locale, device class, timestamp                                  |
| Catalog intent     | category/product view, site search, search result count, filter/sort, pagination, compare, related-content click | category/product/public ID, query class (not raw sensitive input), filter keys/values, result count, rank/click target |
| Product engagement | image/video view, specification tab, document view/download, certificate/CAD request, outbound contact click     | product ID, asset/document ID, locale, action, position/context                                                        |
| Conversion funnel  | CTA click, RFQ start/submit/success/failure, cart/checkout steps, payment/purchase after direct-sale launch      | funnel step, product/offer ID, locale, error code/category, consent state; never full form/payment values              |
| Content quality    | scroll depth, reading completion, FAQ expand, internal-link click, zero-result search, 404/empty/error state     | canonical page/entity ID, locale, context and non-sensitive error category                                             |

- The event schema is versioned, typed and tested. It provides one semantic
  event to Rust analytics, GA4 and Yandex Metrica adapters. The Rust analytics
  team may evolve transport/storage/heatmap implementation without redefining
  EraMix business meaning; external destinations may not receive extra fields.
- The integration contract defines consent state, anonymous/consented session
  identity, event ID/idempotency, schema version, timestamp, locale/entity
  dimensions, allowed attribution fields, batching/retry, deletion/opt-out
  behavior, retention class and error response. Heatmap/session-replay capture
  is opt-in where required and masks form controls, credentials, payment data
  and other sensitive elements by default.
- Admin dashboards expose aggregated demand by product/category/content,
  locale, search/filter demand, conversion funnel, document interest, traffic
  source and content gaps. Product Owner controls date range, aggregation,
  retention, exports and role access; raw user-level inspection is restricted
  to a documented lawful support/consent case.
- Consent mode is enforced before non-essential client analytics. Essential
  server-side operational/security telemetry is separate, minimized and never
  repurposed for marketing. Honor deletion/opt-out requests and retention rules.
- Analytics does not change a page's SEO output automatically. Decisions such
  as creating, noindexing or consolidating content require an authorized human
  review of aggregated evidence, preventing feedback loops and thin-page farms.

### Cross-platform measurement and reconciliation

The Product Owner needs comparable—not falsely merged—reporting across Rust
first-party analytics, GA4, Yandex Metrica, Google Ads, Yandex Direct, Microsoft
Ads, Meta, LinkedIn, TikTok, Search Console and Yandex Webmaster.

- Maintain a versioned metric dictionary: metric name, business definition,
  event source, counting rule, conversion/attribution window, timezone,
  currency/tax policy, consent scope, dimensions, freshness SLA, sampling flag,
  owner and known limitations.
- The reporting adapter retrieves or imports aggregate permitted data into a
  normalized comparison model. Keep source-native metrics intact and display
  source, last refresh, sampled/estimated status and missing-data state beside
  each value. Never sum platform clicks, sessions, impressions or conversions
  as though they were interchangeable.
- Dashboards provide acquisition-to-outcome views: search impressions/clicks
  and landing pages; ad spend/clicks/conversions; first-party engagement and
  heatmap/behavior summaries when available; RFQs, qualified leads, checkout
  and purchase outcomes. Filter by date, locale, campaign/UTM, product/category,
  channel, device and attribution model where supported.
- Reconciliation exposes expected differences and exceptions: consent loss,
  ad-blocking, cross-device identity, API delay, timezone/currency mismatch,
  sampling, duplicate conversion, offline/CRM status and server/client delivery
  divergence. Alert on material unexplained divergence rather than hiding it.
- Access is RBAC-scoped; raw platform/customer identifiers remain in their
  source systems or secret store. Exports are aggregate by default and audited.

## Advertising and marketing-platform control plane

Advertising integrations use a provider-adapter architecture. The platform is
designed for Google Ads, Yandex Direct, Microsoft Ads, Meta,
LinkedIn, TikTok and future approved providers without coupling business code
to a vendor SDK or embedding uncontrolled scripts in page templates.

| Capability              | Mandatory behavior                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider configuration  | Authorized admin can enable/disable a provider, select consent category, set non-secret account/container/pixel IDs, map approved conversion events, configure UTM/attribution rules and see effective configuration.                    |
| Secrets and credentials | OAuth tokens, API keys, server-side conversion credentials and verification secrets are references in the deployment secret store only; admin never reads raw values and logs redact them.                                               |
| Client tags             | Load only allowlisted, versioned provider adapters after the applicable user consent. No arbitrary tag-manager HTML/JavaScript, URL, inline script or third-party iframe may be entered through admin.                                   |
| Server-side conversions | Send only approved, consent-permitted, minimized conversion payloads with idempotency keys, retry/error telemetry and reconciliation state. Never transmit passwords, tokens, raw payment data, full free-text forms or unnecessary PII. |
| Attribution             | Preserve documented UTM/click identifiers where lawful, canonicalize them away from SEO URLs, store only the defined retention period and expose aggregate attribution dashboards.                                                       |
| Operations              | Per-provider health, last delivery, rejection reason, event volume, version, change history, test event and immediate kill switch are visible to authorized administrators.                                                              |

- One semantic event registry maps product-interest and conversion events to
  provider-specific event names. `rfq_submit`, qualified lead, checkout and
  purchase mappings are reviewed independently; an ad-platform mapping cannot
  redefine the source business event.
- Settings are typed, RBAC/CSRF-protected, concurrency-safe and audited with a
  reason and rollback. Changes support preview/test mode before production
  enablement. A provider failure must not block checkout, publication, analytics
  collection or SEO rendering.
- Use consent management and regional privacy rules as a hard gate. The Product
  Owner can export aggregate performance data and configure retention/role
  access, but raw advertising identifiers are not used as a general customer
  profile or exposed to unprivileged staff.

## robots.txt and query parameters

- Serve `/robots.txt` from the root with `200`, UTF-8/ASCII-safe directives,
  a `Sitemap:` reference, and no accidental redirect or environment-specific
  host. Test it after every deployment.
- Do not block CSS, JavaScript, or image resources needed to render/index a
  public page.
- Use `Disallow` only for true crawl exclusion. For Yandex, use `Clean-param`
  only for a parameter proved not to affect content (for example tracking IDs),
  never for locale, pagination, product filtering, or another content-changing
  parameter. The rule is case-sensitive and must be documented per parameter.
- Canonicalize tracking parameters at the application/edge boundary; preserve
  only parameters with explicit product meaning. No query variant is emitted in
  a sitemap.
- Search/filter/sort/account/cart/checkout routes are `noindex`; account,
  checkout and internal search also require access controls where applicable.
  A paginated series with substantively different product lists is crawlable
  and self-canonical; it is normally omitted from the sitemap. Sorting and
  presentation-only variants are `noindex,follow` and canonicalize to the
  unparameterized collection. Do not use `Clean-param` for pagination,
  filters, locale, or another content-changing value.

## Sitemap contract

- Publish a sitemap index and type/locale-specific sitemaps for static pages,
  categories, products, articles, CMS pages, and FAQ. Only published canonical
  200 URLs are eligible.
- Emit truthful `lastmod` from the publication/content state. Do not fabricate
  `priority` or `changefreq` as ranking controls.
- Validate XML, absolute HTTPS URLs, host, locale, canonical parity, `lastmod`,
  and exclusion of redirects/drafts/private URLs in automated tests.
- Submit the sitemap index once in both Search Console and Yandex Webmaster.
  Re-submit/trigger reprocessing only after a material release; monitor errors,
  not rankings alone.
- IndexNow is a P1 notification adapter for Bing and Yandex only. It sends
  canonical URLs after a successful public publish/unpublish/redirect change,
  uses a deployment-secret key and public key-file verification, is retried
  with bounded observability, and never substitutes sitemap correctness or
  Google indexing. Google does not consume IndexNow.

## Metadata and structured data

- Each public page emits a unique, human-reviewed title, description, H1,
  canonical, language, robots directive, Open Graph data, and appropriate image
  metadata. Metadata is server-rendered; primary content is never client-only.
- JSON-LD must exactly describe visible content. Supported types are
  `Organization`/`LocalBusiness` only with real verified data, `WebSite`,
  `BreadcrumbList`, `CollectionPage`/`ItemList`, `Product`, `Article`,
  `FAQPage`, `WebPage`, and `ImageObject` where applicable.
- Indicative “from” pricing is not an `Offer`, price, availability, or shipping
  claim until commercial facts are approved. Never create rich-result markup for
  content not displayed to the user.
- A quote-only product may still emit truthful `Product` identity markup such as
  name, description, image, SKU/public ID and brand when those fields are
  visible. It must omit `offers`/`priceSpecification` until the related price,
  currency, availability and seller facts are a real public commercial offer.
- If a verified, public, locale-specific offer becomes available, `Product` +
  `Offer`/`AggregateOffer` may be emitted only with the exact visible price,
  currency, availability, seller, and validity facts. Schema markup never
  turns a quote-only price into a binding offer.
- `FAQPage` may describe visible, maintained FAQ content but is not a promise
  of Google rich results or AI inclusion. A published FAQ needs real questions
  and answers; do not add generic FAQ solely for markup.
- Validate markup with Google Rich Results Test and Yandex structured-data
  validator after a release; failures are triaged before declaring SEO-ready.

## Performance and page experience

- Set and enforce launch budgets for LCP, INP, CLS, TTFB, JS, CSS, image weight,
  and accessibility. Measure lab data in Pi/CI and field data after launch.
- Use server/static rendering for public content; optimize responsive images,
  image dimensions, alt text, fonts, loading priority, caching, compression,
  third-party scripts, and error/loading states.
- No third-party analytics or tags load without the approved consent policy and
  configured identifier. Performance regressions are release blockers when they
  breach an approved budget.
- Launch targets are the "good" Core Web Vitals thresholds (LCP <= 2.5 s, INP
  <= 200 ms, CLS <= 0.1 at the 75th percentile of real-user data). Tighter lab
  budgets may be used internally, but a synthetic score, a fixed JS byte cap,
  or a 100% Lighthouse score is not a release or ranking guarantee.

## Search Console and Webmaster operations

Before public launch, the owner must verify:

1. preferred HTTPS host/property ownership and verification method;
2. `robots.txt`, sitemap index, and representative page server responses;
3. URL inspection/status for each public template and locale;
4. canonical/hreflang/structured-data validation;
5. mobile usability, Core Web Vitals/PageSpeed, crawl/index coverage and
   security/manual-action reports.

Post-launch cadence:

- Daily for the first 14 days: crawl/server/indexing errors, excluded pages,
  sitemap processing, unexpected 4xx/5xx, blocked resources, and security
  issues.
- Weekly: indexed-versus-canonical URL parity, duplicate/canonical conflicts,
  CWV, query/page clicks/impressions, broken internal links, and Yandex crawl
  statistics/site structure.
- Per release: inspect representative changed URLs, validate sitemap/robots,
  re-check redirects and hreflang, and use manual reindexing sparingly for
  important changed canonical pages.
- Maintain a consent-aware dashboard for organic sessions and qualified RFQs by
  locale, page type and query cluster. P0 events: `page_view`, `view_item`,
  `view_item_list`, inquiry/CTA initiation, `rfq_submit`, and telephone click.
  P1 events: document download, CAD request, email click and language switch.
  Event names may differ by analytics provider but the documented semantics and
  no-PII rule are mandatory.
- Treat numeric traffic, indexing duration, positions, conversion rate and AI
  Overview appearance as forecasts to review, not launch gates or guaranteed
  outcomes. The go-live gate is technical validity and a complete P0 content
  release, measured against the actual business baseline after launch.

## Integration boundary

Search Console and Yandex APIs, if enabled later, are read-only reporting
adapters. They require explicit Product Owner approval, least-privilege service
accounts/tokens in the secret store, redacted logs, rate limits, retention
rules, and an audit trail. They must not automatically submit arbitrary URLs,
alter robots/sitemaps, or expose search query data publicly.

## AI search and agentic-web policy

- Google AI Overviews and AI Mode have no separate eligibility markup or special
  file. A page must be indexable and snippet-eligible in normal Google Search;
  the ordinary technical SEO, helpful-content, internal-link, text, image/video,
  and visible-structured-data rules above remain the contract.
- Do not create keyword-variation farms, fan-out query pages, AI summaries of
  existing material, or scaled generated content to manipulate AI answers. AI
  may assist research, structure, translation review, or drafting, but a human
  editor owns factual accuracy, originality, evidence, localization, and final
  publication. AI-produced metadata, alt text, JSON-LD, and product content are
  held to the same accuracy standard as human content.
- Publish original first-hand expertise, evidence, helpful comparisons, clear
  headings, scannable text, and relevant high-quality images/video. Do not make
  claims that cannot be verified on the visible page.
- The Google Preferred Sources feature is a reader preference, not a publisher
  ranking control. A Product Owner may use the domain-level URL
  `https://google.com/preferences/source?q=<domain>` in a voluntary CTA or
  campaign only after brand/legal review. It must never be presented as a
  guarantee, forced choice, or a subdirectory-specific control.

## Experimental agentic browsing and special files

- Lighthouse Agentic Browsing and WebMCP are experimental proposed standards,
  not a Google ranking signal and not a release gate until separately accepted.
  Track their pass ratio as diagnostic evidence only. WebMCP requires Chrome 150+
  and the relevant origin trial; no origin-trial token is committed or enabled
  without explicit Product Owner authorization and Pi/browser validation.
- Semantic HTML, programmatic names for interactive controls, a valid accessible
  tree, stable layout/low CLS, and deterministic forms are mandatory now because
  they improve both accessibility and future machine interaction.
- Google Search ignores `llms.txt`, AI text files, special Markdown, AEO/GEO
  markup, and “chunking” tactics for Search and its generative features.
  `/llms.txt` and `/ai.txt` must never be represented as Google ranking or AI
  Overview controls. They may be published as a **non-SEO compatibility layer**
  only after an owner approves the public, factual, locale-aware content,
  canonical URLs, test coverage, and review cadence; no credentials, private
  documents, unpublished prices, or unverified claims may appear in them.
- Required operational text/XML files are `robots.txt` and sitemap XML/index.
  `security.txt` may be added for responsible disclosure but is not an SEO
  control. Every special file has a content owner, automated availability test,
  canonical host/HTTPS policy, and release review.

## Evidence required for launch

- CI SEO audit: canonical/hreflang/sitemap/robots/metadata/JSON-LD tests green.
- Pi browser/performance evidence for all public templates and locales.
- Search Console and Yandex Webmaster screenshots/exports stored outside Git,
  showing sitemap accepted and no release-blocking crawl/security error.
- A release record with public base URL, sitemap URL, representative inspected
  URLs, and any accepted risk.
- Test 200/301/404/410 responses, forms and their consent-aware analytics
  events on representative `ru`, `en`, and `uz` public pages. Confirm that
  every sitemap URL is an indexable canonical 200 and that no public template
  relies on client-side-only primary text/links.

### Go/no-go checklist

The Product Owner may approve launch only when all P0 rows in the implementation
matrix have evidence, no release-blocking Search Console/Yandex/Bing crawl or
security error remains, and the following are true:

1. no environment-wide `Disallow: /`, no staging canonical host, no accidental
   `noindex`, and no blocked public CSS/JS/image resource;
2. each public template has a real `200` example for all available locales,
   correct canonical/hreflang/robots and an internal incoming link;
3. sitemap and robots match the live canonical host; draft, private, account,
   admin, API, search, cart and action URLs are absent from sitemaps;
4. representative structured data matches visible content; it has no false
   offer, availability, review, author, organization or FAQ claim;
5. public forms, error states and events work on mobile and desktop under the
   consent policy; no analytics event carries credentials, session data or PII;
6. field/lab performance evidence is recorded, with remediation or an explicit
   accepted risk for any Core Web Vitals budget breach;
7. post-launch daily monitoring owner, alert path and weekly review cadence are
   assigned before traffic is invited.

## Official references

- Google: robots.txt, canonicalization, localized versions, sitemaps,
  structured data, Page Experience, Search Console monitoring.
- Yandex: robots.txt, Clean-param, Sitemap validator, server-response check,
  crawl statistics, page indexing and structured-data validator.

See the URLs in Appendix G of the MVP specification for the normative source
set and version-checked links.
