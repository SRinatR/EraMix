import { describe, expect, it } from 'vitest';
import { conflictTargetIncludes } from './prisma-error-mapping.js';

describe('conflictTargetIncludes', () => {
  it('matches when meta.target is an array containing the column', () => {
    expect(conflictTargetIncludes({ target: ['publicId'] }, 'publicId')).toBe(true);
  });

  it('matches when meta.target is a constraint-name string containing the column', () => {
    expect(conflictTargetIncludes({ target: 'products_publicId_key' }, 'publicId')).toBe(true);
  });

  it('does not match a different column', () => {
    expect(conflictTargetIncludes({ target: ['sku'] }, 'publicId')).toBe(false);
    expect(conflictTargetIncludes({ target: 'products_sku_key' }, 'publicId')).toBe(false);
  });

  it('returns false for undefined/missing meta or target', () => {
    expect(conflictTargetIncludes(undefined, 'publicId')).toBe(false);
    expect(conflictTargetIncludes({}, 'publicId')).toBe(false);
  });
});
