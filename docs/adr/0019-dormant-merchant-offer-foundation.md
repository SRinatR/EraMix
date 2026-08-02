# ADR-0019: Dormant, fail-closed Merchant Offer/feed foundation

- Status: Accepted — Product Owner decision, 2026-08-03
- Date: 2026-08-03
- Requirement source: CLAUDE.md/docs/runbooks/search-visibility.md's
  direct-sale launch sequence ("(1) model and admin controls; (2) secure
  checkout/order/payment/fulfilment and legal policy; (3) feed generation
  and schema; (4) Merchant Center verification/diagnostics; (5) limited
  approved product rollout; (6) monitoring, reconciliation and rollback"),
  Product Owner amendment 2026-08-03 ("implement the future direct-sale
  Merchant Offer/feed foundation now as a dormant, fail-closed vertical
  slice... This is preparation for a future real checkout, not permission
  to publish Merchant output today").

## Context

The MVP's order workflow is quote-only (ADR-0005): `OrderLine` carries no
price, and `ProductTranslation`'s `priceFromMinor`/`currency`/`priceMode`/
`priceDisclaimer` are explicitly non-binding, display-only "from" pricing —
never an `Offer`. CLAUDE.md separately mandates preparing a **future**
direct-sale/Merchant Center capability "as a separate commercial mode, not
as an overload of the current quote-only `ProductTranslation` price," with
its own versioned, effective-dated source of truth for exact price,
currency, tax display, availability, seller, product identifiers, delivery,
returns, and actual checkout eligibility. Building this only once a real
checkout exists would mean modeling exact-price/availability/seller/policy
facts under release pressure, with no prior schema/validation/admin-UI
foundation to build on — the Product Owner's amendment instead schedules
this foundation now, structurally incapable of producing real Merchant
output until it is explicitly approved.

## Decision

Add a complete, independently versioned `Offer` domain model, admin control
plane, and feed/JSON-LD generator — all hard-disabled by default and unable
to be enabled by this session's own work:

- **Never overloads `ProductTranslation`/the indicative price.** `Offer` is
  a new aggregate (`packages/domain/src/offer.ts`,
  `packages/infrastructure/prisma/schema.prisma`'s `Offer` model) with its
  own `id`, linked to `Product` by `productId` — `ProductTranslation` gains
  no new column.
- **Quote-only exclusion is structural, not a feed-time filter alone.**
  `Product` gains a new `directSaleEnabled: Boolean @default(false)`
  column. An `Offer` belonging to a product where `directSaleEnabled` is
  false is invalid at the domain-validation layer (`validateEffectiveOffer`
  throws), not merely excluded later by the feed generator — the same
  "fail closed per item" CLAUDE.md names for feed generation applies one
  layer earlier, at the write itself.
- **The existing `PlatformSettings.merchantCenterEnabled` kill switch is
  reused, not duplicated.** `packages/domain/src/platform-settings.ts`'s
  `validateEffectivePlatformSettings` already throws if
  `merchantCenterEnabled` is ever set `true` ("no versioned sellable-offer
  (Merchant) model exists yet" — Phase B slice 1, 2026-08-02). This ADR
  does not touch that validator. The feed generator and `Product`/`Merchant`
  JSON-LD generator built in this slice both read this same flag and always
  see it `false` — they are reachable in code but structurally unable to
  produce real Merchant output in this repository's current state. Lifting
  the guard is an explicit, separate, future Product Owner decision (a
  one-line validator change plus the real checkout/legal/seller-verification
  work CLAUDE.md's launch sequence names), not something this slice does or
  enables.
- **Every write is fully governed**, matching every other admin-mutable
  aggregate already in this codebase: RBAC (`settings.manage` — ADMIN only,
  the same "Product Owner only" ownership search-visibility.md's settings
  table assigns Merchant Center), optimistic concurrency, an audit event
  with actor/reason, and a transactional outbox event (for a future
  feed-regeneration trigger — not wired to anything live in this slice).
- **No public feed URL, no Google Merchant Center API call, no credential.**
  The feed/JSON-LD generators are pure functions over already-fetched data,
  exercised only by unit/integration tests and an authorized admin preview
  endpoint in this slice — never mounted at a public, crawlable URL.

## Consequences

- A future "real direct-sale launch" ADR must explicitly: (1) get Product
  Owner approval to flip `merchantCenterEnabled`'s validator from
  reject-always to a real gate, (2) confirm real checkout/payment/
  fulfilment/legal-policy work has shipped (CLAUDE.md's launch sequence
  steps 2 onward — none of which this slice touches), and (3) mount the
  feed generator at a real, monitored public/authenticated URL and wire
  the real Google Merchant Center integration. None of that is in scope
  here.
- `IMPLEMENTATION_ROADMAP.md`'s status for this slice is recorded as
  "prepared but disabled pending real checkout, verified seller/policies,
  exact public offer facts, and explicit Product Owner approval" — never
  "complete"/"launched."
