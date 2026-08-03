import { describe, expect, it } from 'vitest';
import { catalogueEntryFor, ERROR_CATALOGUE } from './error-catalogue.js';

describe('ERROR_CATALOGUE', () => {
  it('has no duplicate codes', () => {
    const codes = ERROR_CATALOGUE.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives every entry exactly one canonical, valid HTTP status', () => {
    for (const entry of ERROR_CATALOGUE) {
      expect(Number.isInteger(entry.status)).toBe(true);
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.status).toBeLessThan(600);
    }
  });
});

describe('catalogueEntryFor', () => {
  it('returns the catalogued entry for a known code', () => {
    expect(catalogueEntryFor('VALIDATION_FAILED')).toMatchObject({ status: 422 });
    expect(catalogueEntryFor('PAYLOAD_TOO_LARGE')).toMatchObject({ status: 413 });
    expect(catalogueEntryFor('UNSUPPORTED_MEDIA_TYPE')).toMatchObject({ status: 415 });
    expect(catalogueEntryFor('MALFORMED_REQUEST')).toMatchObject({ status: 400 });
    expect(catalogueEntryFor('METHOD_NOT_ALLOWED')).toMatchObject({ status: 405 });
  });

  it('throws for an unknown code', () => {
    // @ts-expect-error deliberately passing an invalid code to exercise the guard
    expect(() => catalogueEntryFor('NOT_A_REAL_CODE')).toThrow(
      /is missing from the error catalogue/,
    );
  });
});
