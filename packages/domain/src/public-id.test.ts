import { describe, expect, it } from 'vitest';
import { generatePublicId, isValidPublicId, PUBLIC_ID_LENGTH } from './public-id.js';

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
