import { describe, expect, it } from 'vitest';
import { clampPagination, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination.js';

describe('clampPagination', () => {
  it('defaults limit/offset when neither is supplied', () => {
    expect(clampPagination({})).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
  });

  it('passes through a valid limit/offset', () => {
    expect(clampPagination({ limit: 10, offset: 40 })).toEqual({ limit: 10, offset: 40 });
  });

  it('clamps a limit above MAX_PAGE_SIZE (DB-005: bounded queries)', () => {
    expect(clampPagination({ limit: 100_000 })).toEqual({ limit: MAX_PAGE_SIZE, offset: 0 });
  });

  it('clamps a limit below 1 up to 1', () => {
    expect(clampPagination({ limit: 0 })).toEqual({ limit: 1, offset: 0 });
    expect(clampPagination({ limit: -5 })).toEqual({ limit: 1, offset: 0 });
  });

  it('clamps a negative offset up to 0', () => {
    expect(clampPagination({ offset: -10 })).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
  });
});
