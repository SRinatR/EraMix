import { describe, expect, it } from 'vitest';
import { parseAllowlistedParam, parsePaginationParams, parseStringParam } from './pagination';

describe('parsePaginationParams', () => {
  it('reads plain cursor/limit with no prefix', () => {
    expect(parsePaginationParams({ cursor: 'abc', limit: '10' })).toEqual({
      cursor: 'abc',
      limit: 10,
    });
  });

  it('reads prefixed cursor/limit for a multi-list page', () => {
    expect(
      parsePaginationParams(
        { categoriesCursor: 'abc', categoriesLimit: '5', productsLimit: '99' },
        'categories',
      ),
    ).toEqual({ cursor: 'abc', limit: 5 });
  });

  it('ignores a non-numeric limit', () => {
    expect(parsePaginationParams({ limit: 'not-a-number' })).toEqual({});
  });

  it('ignores an empty cursor', () => {
    expect(parsePaginationParams({ cursor: '' })).toEqual({});
  });
});

describe('parseStringParam', () => {
  it('reads a plain search param', () => {
    expect(parseStringParam({ search: 'widget' }, 'search')).toBe('widget');
  });

  it('treats an empty string as absent', () => {
    expect(parseStringParam({ search: '' }, 'search')).toBeUndefined();
  });

  it('reads a prefixed param', () => {
    expect(parseStringParam({ productsSearch: 'widget' }, 'search', 'products')).toBe('widget');
  });
});

describe('parseAllowlistedParam (DB-005 defense-in-depth)', () => {
  const SORTS = ['createdAt_asc', 'createdAt_desc'] as const;

  it('accepts an allowlisted value', () => {
    expect(parseAllowlistedParam({ sort: 'createdAt_asc' }, 'sort', SORTS)).toBe('createdAt_asc');
  });

  it('rejects a value outside the allowlist instead of passing it through', () => {
    expect(
      parseAllowlistedParam({ sort: "'; DROP TABLE orders; --" }, 'sort', SORTS),
    ).toBeUndefined();
  });

  it('rejects an unrelated column name not in the allowlist', () => {
    expect(parseAllowlistedParam({ sort: 'password_asc' }, 'sort', SORTS)).toBeUndefined();
  });
});
