import { describe, expect, it } from 'vitest';
import { SPACING_SCALE_PX } from './tokens.js';

describe('spacing scale', () => {
  it('is sorted ascending and starts at zero', () => {
    expect(SPACING_SCALE_PX[0]).toBe(0);
    const sorted = [...SPACING_SCALE_PX].sort((a, b) => a - b);
    expect(SPACING_SCALE_PX).toEqual(sorted);
  });
});
