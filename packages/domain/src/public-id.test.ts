import { describe, expect, it } from 'vitest';
import {
  generatePublicId,
  isValidPublicId,
  LEGACY_PUBLIC_ID_LENGTH,
  PUBLIC_ID_LENGTH,
  splitCatalogSlug,
} from './public-id.js';

describe('publicId', () => {
  it('generates a 16-character id (ADR-0021) using only unambiguous uppercase characters', () => {
    const id = generatePublicId();
    expect(id).toHaveLength(PUBLIC_ID_LENGTH);
    expect(PUBLIC_ID_LENGTH).toBe(16);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it('generates distinct ids across repeated calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generatePublicId()));
    expect(ids.size).toBe(50);
  });

  it('validates a well-formed new-format (16-char) id and rejects malformed ones', () => {
    expect(isValidPublicId(generatePublicId())).toBe(true);
    expect(isValidPublicId('too-short')).toBe(false);
    expect(isValidPublicId('ILLEGAL1ILLEGAL1')).toBe(false);
    expect(isValidPublicId('p8k4f2m9zzzzzzzz')).toBe(false);
  });

  it('accepts a legacy 8-character id forever — never rewritten, never deprecated', () => {
    expect(LEGACY_PUBLIC_ID_LENGTH).toBe(8);
    expect(isValidPublicId('P8K4F2M9')).toBe(true);
  });

  it('rejects a value whose length is neither the legacy 8 nor the current 16', () => {
    expect(isValidPublicId('P8K4F2M')).toBe(false); // 7
    expect(isValidPublicId('P8K4F2M9X')).toBe(false); // 9
    expect(isValidPublicId('P8K4F2M9X2VQ8JHA')).toBe(true); // 16, sanity check
    expect(isValidPublicId('P8K4F2M9X2VQ8JHAX')).toBe(false); // 17
  });

  it('rejects lowercase input (case-sensitive, matching the generated alphabet)', () => {
    expect(isValidPublicId('p8k4f2m9')).toBe(false);
  });
});

describe('splitCatalogSlug', () => {
  it('splits a well-formed new-format (16-char) product slug into publicId and rest', () => {
    const publicId = generatePublicId();
    expect(splitCatalogSlug(`${publicId}-red-t-shirt`)).toEqual({
      publicId,
      rest: 'red-t-shirt',
    });
  });

  it('splits a well-formed legacy (8-char) product slug into publicId and rest', () => {
    expect(splitCatalogSlug('P8K4F2M9-red-t-shirt')).toEqual({
      publicId: 'P8K4F2M9',
      rest: 'red-t-shirt',
    });
  });

  it('returns undefined for a plain category slug (no publicId prefix)', () => {
    expect(splitCatalogSlug('chairs')).toBeUndefined();
  });

  it('returns undefined when neither the 16- nor 8-character prefix is a valid publicId', () => {
    expect(splitCatalogSlug('too-short-slug-here')).toBeUndefined();
    expect(splitCatalogSlug('illegal1-red-t-shirt')).toBeUndefined();
  });

  it('returns undefined when the character after a legacy-length publicId is not a hyphen', () => {
    expect(splitCatalogSlug('P8K4F2M9xred-t-shirt')).toBeUndefined();
  });

  it('returns undefined when the character after a new-length publicId is not a hyphen', () => {
    const publicId = generatePublicId();
    expect(splitCatalogSlug(`${publicId}xred-t-shirt`)).toBeUndefined();
  });

  it('disambiguates unambiguously: a legacy 8-char id is never misread as part of a 16-char one, and vice versa', () => {
    // The hyphen at position 8 is never itself a Crockford-alphabet
    // character, so it can never pass the 16-length alphabet check —
    // proving the longest-first parsing order in splitCatalogSlug/
    // public-id.ts cannot misfire, not merely that it happens to work here.
    expect(splitCatalogSlug('P8K4F2M9-a-longer-slug-that-keeps-going')).toEqual({
      publicId: 'P8K4F2M9',
      rest: 'a-longer-slug-that-keeps-going',
    });
  });
});
