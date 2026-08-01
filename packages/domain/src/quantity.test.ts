import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { parseQuantity } from './quantity.js';

describe('parseQuantity', () => {
  it('accepts a positive integer', () => {
    expect(parseQuantity(3)).toBe(3);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects %s as an invalid quantity', (value) => {
    expect(() => parseQuantity(value)).toThrow(ValidationFailedError);
  });
});
