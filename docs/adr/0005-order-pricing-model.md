# ADR-0005: Order pricing — quote-only vs. price snapshot

- Status: Blocked — pending Q-03
- Date: 2026-08-01
- Requirement source: TZ v1.1 Appendix D (ADR-005, "Бизнес-решение"), §21 Q-03

## Context

`OrderLine` (§5.1) may or may not carry a `priceSnapshot`. TZ §21 Q-03 states
the pricing model is undecided and explicitly assigns this to Sales +
Product, not engineering.

## Decision

Not made. Blocked pending a Sales/Product decision between:

- **Quote-only**: `OrderLine` never stores a price; pricing is handled
  entirely outside this system (e.g. manual quoting by a manager).
- **Price snapshot**: `OrderLine.priceSnapshot` is captured at order-submit
  time and is immutable thereafter (consistent with the "line snapshots do
  not change when catalog data changes" invariant already fixed in
  CLAUDE.md/TZ §5.2).

## Consequences

Phase 5 (Ordering) cannot finalize the `OrderLine` schema or submit-order use
case until this is resolved — the `priceSnapshot` field is either present and
required, or absent, not "maybe." Do not scaffold it speculatively in Phase 1.
