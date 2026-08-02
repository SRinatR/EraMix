import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { validateRetirementReason } from './retirement.js';

describe('validateRetirementReason', () => {
  it('trims and returns a valid reason', () => {
    expect(validateRetirementReason('  Discontinued by manufacturer, no successor.  ')).toBe(
      'Discontinued by manufacturer, no successor.',
    );
  });

  it('rejects an empty or whitespace-only reason', () => {
    expect(() => validateRetirementReason('')).toThrow(ValidationFailedError);
    expect(() => validateRetirementReason('   ')).toThrow(ValidationFailedError);
  });

  it('rejects a reason over the maximum length', () => {
    expect(() => validateRetirementReason('a'.repeat(2001))).toThrow(ValidationFailedError);
  });

  it('accepts a reason at the maximum length', () => {
    expect(validateRetirementReason('a'.repeat(2000))).toHaveLength(2000);
  });
});
