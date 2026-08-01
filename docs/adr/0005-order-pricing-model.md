# ADR-0005: Order pricing — hybrid indicative pricing

- Status: Accepted — Product Owner decision, 2026-08-01
- Date: 2026-08-01
- Requirement source: TZ v1.3 Appendix D (ADR-005, "Бизнес-решение"), §21 Q-03

## Context

`OrderLine` (§5.1) may or may not carry a `priceSnapshot`. TZ §21 Q-03 states
the pricing model is undecided and explicitly assigns this to Sales +
Product, not engineering. The choice was between:

- **Quote-only**: `OrderLine` never stores a price; pricing is handled
  entirely outside this system (e.g. manual quoting by a manager).
- **Price snapshot**: `OrderLine.priceSnapshot` is captured at order-submit
  time and is immutable thereafter.

## Decision

Hybrid indicative pricing. The order workflow stays **quote-only**; the
catalog gains a **non-binding, display-only "from" price**.

- `OrderLine` (Phase 5) must not contain a binding price, a price snapshot,
  a tax total, or a payable total in MVP. A manager confirms final
  commercial terms manually after order submission, per the existing
  quote-only flow (WAITING_CONFIRMATION status).
- `ProductTranslation` (Phase 1) gains an optional, structured, display-only
  indicative price:
  - `priceFromMinor: Int?` — integer amount in minor currency units (e.g.
    cents/tiyin). Optional; a product may publish without a price.
  - `currency: Char(3)?` — ISO 4217 currency code; **required whenever
    `priceFromMinor` is present**, enforced by a `CHECK` constraint, not
    application code alone.
  - `priceMode: PriceDisplayMode` — enum, currently only `FROM_PRICE_INDICATIVE`
    (extensible without a breaking migration when more modes are added).
  - `priceDisclaimer: String?` — localized non-binding disclaimer text
    (e.g. "от", "starting from"); comes from the translation row, not a
    hardcoded string, so it is itself localized per `locale`.
  - The monetary fields (`priceFromMinor`, `currency`, `priceMode`) are
    structured data on `ProductTranslation`, not free text, so they can be
    validated, indexed, and rendered consistently; only the disclaimer
    label is translation-owned prose.
- This is explicitly **not an offer or a binding price** — it is indicative
  "from" pricing for browsing/comparison. UI copy and JSON-LD/Schema.org
  output must reflect this (no `Offer.price` semantics implying a binding
  price) — an implementation detail for Phase 3.
- Schema is designed for **future evolution without a breaking migration**:
  a later `PriceList`/`PriceListItem` model (customer/company-specific price
  lists, contract discounts, validity periods, currency/tax rules) and an
  immutable `OrderLine` price snapshot can both be added as new tables/columns
  later. Phase 1 does **not** implement `PriceList`, contract pricing, or any
  `OrderLine` price field — only the indicative catalog price and the
  quote-only order flow.

## Consequences

- Phase 1's `ProductTranslation` Prisma model includes `priceFromMinor`,
  `currency`, `priceMode`, `priceDisclaimer` with a `CHECK` constraint tying
  `currency` to `priceFromMinor` presence.
- Phase 5's `OrderLine` schema has no price/tax/total column; the order
  workflow remains individual manager-confirmed discounts and quote-only
  confirmation, unchanged from the TZ's base quote-only description.
- `packages/contracts` OpenAPI schemas for `ProductTranslation`/`Product`
  document the indicative-price fields as optional and explicitly non-binding
  in their `description`.
- Q-03 is resolved by this ADR; `docs/OPEN_QUESTIONS.md` is updated
  accordingly.
