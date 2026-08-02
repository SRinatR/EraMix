import { describe, expect, it } from 'vitest';
import {
  generatePublicId,
  isValidPublicId,
  PUBLIC_ID_LENGTH,
  splitCatalogSlug,
} from './public-id.js';

describe('publicId', () => {
  it('generates an id of the documented length using only unambiguous uppercase characters', () => {
    const id = generatePublicId();
    expect(id).toHaveLength(PUBLIC_ID_LENGTH);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it('generates distinct ids across repeated calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generatePublicId()));
    expect(ids.size).toBe(50);
  });

  it('validates a well-formed id and rejects malformed ones', () => {
    expect(isValidPublicId(generatePublicId())).toBe(true);
    expect(isValidPublicId('too-short')).toBe(false);
    expect(isValidPublicId('ILLEGAL1')).toBe(false);
    expect(isValidPublicId('p8k4f2m9')).toBe(false);
  });
});

describe('splitCatalogSlug', () => {
  it('splits a well-formed product slug into publicId and rest', () => {
    expect(splitCatalogSlug('P8K4F2M9-red-t-shirt')).toEqual({
      publicId: 'P8K4F2M9',
      rest: 'red-t-shirt',
    });
  });

  it('returns undefined for a plain category slug (no publicId prefix)', () => {
    expect(splitCatalogSlug('chairs')).toBeUndefined();
  });

  it('returns undefined when the publicId-length prefix is not a valid publicId', () => {
    expect(splitCatalogSlug('too-short-slug-here')).toBeUndefined();
    expect(splitCatalogSlug('illegal1-red-t-shirt')).toBeUndefined();
  });

  it('returns undefined when the character after the publicId is not a hyphen', () => {
    expect(splitCatalogSlug('P8K4F2M9xred-t-shirt')).toBeUndefined();
  });
});
