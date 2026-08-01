import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { generateOrderNumber } from './order-number.js';
import { generatePublicId } from './public-id.js';
import { articleUrl, categoryUrl, orderUrl, pageUrl, productUrl } from './url-builder.js';

describe('url-builder', () => {
  it('builds the canonical article URL', () => {
    expect(articleUrl({ locale: 'en', slug: 'friendship-festival' })).toBe(
      '/en/articles/friendship-festival',
    );
  });

  it('builds the canonical page URL', () => {
    expect(pageUrl({ locale: 'ru', slug: 'about-us' })).toBe('/ru/pages/about-us');
  });

  it('builds the canonical category URL', () => {
    expect(categoryUrl({ locale: 'uz', slug: 'general' })).toBe('/uz/catalog/general');
  });

  it('builds the canonical product URL as publicId-slug under /catalog', () => {
    const publicId = generatePublicId();
    expect(productUrl({ locale: 'en', publicId, slug: 'red-t-shirt' })).toBe(
      `/en/catalog/${publicId}-red-t-shirt`,
    );
  });

  it('rejects a malformed publicId', () => {
    expect(() => productUrl({ locale: 'en', publicId: 'not-a-public-id', slug: 'x' })).toThrow(
      ValidationFailedError,
    );
  });

  it('builds the canonical order URL', () => {
    const orderNumber = generateOrderNumber();
    expect(orderUrl({ locale: 'en', orderNumber })).toBe(`/en/account/orders/${orderNumber}`);
  });

  it('rejects a malformed order number', () => {
    expect(() => orderUrl({ locale: 'en', orderNumber: 'not-an-order-number' })).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a non-normalized slug rather than silently normalizing it', () => {
    expect(() => articleUrl({ locale: 'en', slug: 'Not Normalized' })).toThrow(
      ValidationFailedError,
    );
  });
});
