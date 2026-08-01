import { ValidationFailedError } from './errors.js';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Non-binding, display-only "from" price on ProductTranslation (ADR-0005).
 * Never a payable total — OrderLine carries no price field in MVP.
 */
export interface IndicativePrice {
  readonly priceFromMinor: number;
  readonly currency: string;
  readonly priceMode: 'FROM_PRICE_INDICATIVE';
  readonly priceDisclaimer?: string;
}

export interface IndicativePriceInput {
  readonly priceFromMinor?: number | undefined;
  readonly currency?: string | undefined;
  readonly priceDisclaimer?: string | undefined;
}

/**
 * Mirrors the `product_translation_price_currency_pair` CHECK constraint at
 * the domain layer: priceFromMinor and currency are present together or
 * absent together. Returns undefined when the product has no indicative
 * price yet.
 */
export function createIndicativePrice(input: IndicativePriceInput): IndicativePrice | undefined {
  const { priceFromMinor, currency, priceDisclaimer } = input;

  if (priceFromMinor === undefined && currency === undefined) {
    return undefined;
  }

  if (priceFromMinor === undefined || currency === undefined) {
    throw new ValidationFailedError(
      'priceFromMinor and currency must be set together, or both omitted.',
      { priceFromMinor, currency },
    );
  }

  if (!Number.isInteger(priceFromMinor) || priceFromMinor < 0) {
    throw new ValidationFailedError(
      `priceFromMinor must be a non-negative integer, got ${priceFromMinor}.`,
      { priceFromMinor },
    );
  }

  if (!CURRENCY_PATTERN.test(currency)) {
    throw new ValidationFailedError(
      `currency must be a 3-letter ISO 4217 code, got "${currency}".`,
      {
        currency,
      },
    );
  }

  return {
    priceFromMinor,
    currency,
    priceMode: 'FROM_PRICE_INDICATIVE',
    ...(priceDisclaimer !== undefined ? { priceDisclaimer } : {}),
  };
}
