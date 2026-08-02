import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { validateIndexNowSubmission } from './indexnow.js';

const VALID: Parameters<typeof validateIndexNowSubmission>[0] = {
  host: 'eramix.example',
  key: 'a1b2c3d4e5f6',
  keyLocation: 'https://eramix.example/api/seo/indexnow-key.txt',
  urlList: ['https://eramix.example/en/catalog/chairs'],
};

describe('validateIndexNowSubmission', () => {
  it('accepts a well-formed submission', () => {
    expect(() => validateIndexNowSubmission(VALID)).not.toThrow();
  });

  it('rejects an empty host', () => {
    expect(() => validateIndexNowSubmission({ ...VALID, host: '' })).toThrow(ValidationFailedError);
  });

  it('rejects a key that is too short', () => {
    expect(() => validateIndexNowSubmission({ ...VALID, key: 'short' })).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a key containing illegal characters', () => {
    expect(() => validateIndexNowSubmission({ ...VALID, key: 'not_a_valid_key!' })).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects an empty urlList', () => {
    expect(() => validateIndexNowSubmission({ ...VALID, urlList: [] })).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a urlList exceeding the 10,000-URL limit', () => {
    const urlList = Array.from(
      { length: 10_001 },
      (_, i) => `https://eramix.example/en/catalog/product-${i}`,
    );
    expect(() => validateIndexNowSubmission({ ...VALID, urlList })).toThrow(ValidationFailedError);
  });

  it('rejects a non-https URL', () => {
    expect(() =>
      validateIndexNowSubmission({
        ...VALID,
        urlList: ['http://eramix.example/en/catalog/chairs'],
      }),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a URL on a different host (never submit a URL you cannot verify ownership of)', () => {
    expect(() =>
      validateIndexNowSubmission({
        ...VALID,
        urlList: ['https://attacker.example/en/catalog/chairs'],
      }),
    ).toThrow(ValidationFailedError);
  });
});
