import { describe, expect, it } from 'vitest';
import { createIndicativePrice } from './indicative-price.js';
import { ValidationFailedError } from './errors.js';

describe('createIndicativePrice', () => {
  it('returns undefined when both fields are absent (product has no indicative price yet)', () => {
    expect(createIndicativePrice({})).toBeUndefined();
  });

  it('returns a structured price when both fields are present', () => {
    const price = createIndicativePrice({
      priceFromMinor: 15000,
      currency: 'UZS',
      priceDisclaimer: 'от',
    });
    expect(price).toEqual({
      priceFromMinor: 15000,
      currency: 'UZS',
      priceMode: 'FROM_PRICE_INDICATIVE',
      priceDisclaimer: 'от',
    });
  });

  it.each([
    [{ priceFromMinor: 15000 }, 'currency missing'],
    [{ currency: 'UZS' }, 'priceFromMinor missing'],
  ] as const)('rejects a partial pair: %s', (input, _description) => {
    expect(() => createIndicativePrice(input)).toThrow(ValidationFailedError);
  });

  it('rejects a negative or non-integer priceFromMinor', () => {
    expect(() => createIndicativePrice({ priceFromMinor: -1, currency: 'UZS' })).toThrow(
      ValidationFailedError,
    );
    expect(() => createIndicativePrice({ priceFromMinor: 1.5, currency: 'UZS' })).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a malformed currency code', () => {
    expect(() => createIndicativePrice({ priceFromMinor: 100, currency: 'usd' })).toThrow(
      ValidationFailedError,
    );
    expect(() => createIndicativePrice({ priceFromMinor: 100, currency: 'US' })).toThrow(
      ValidationFailedError,
    );
  });
});
