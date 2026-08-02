import type { IndicativePrice } from '@eramix/domain';

/**
 * Formats ADR-0005's non-binding "from" price for display. Always includes
 * an explicit non-binding marker — this must never be presented as, or
 * mistaken for, a payable total (CLAUDE.md: "show optional non-binding
 * 'from' price only where permitted, clearly marked as non-binding; never
 * show a binding total/payable amount"). OrderLine itself carries no price
 * field at all, so there is nothing here that could be summed into a total.
 */
export function formatIndicativePrice(price: IndicativePrice): string {
  const amount = (price.priceFromMinor / 100).toFixed(2);
  const disclaimer = price.priceDisclaimer ?? 'from';
  return `${disclaimer} ${amount} ${price.currency} (non-binding, indicative only)`;
}
