import { describe, expect, it } from 'vitest';
import { parseAllowlistedParam, parsePaginationParams, parseStringParam } from './pagination';

describe('parsePaginationParams', () => {
  it('reads plain limit/offset with no prefix', () => {
    expect(parsePaginationParams({ limit: '10', offset: '20' })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it('reads prefixed limit/offset for a multi-list page', () => {
    expect(
      parsePaginationParams(
        { categoriesLimit: '5', categoriesOffset: '15', productsLimit: '99' },
        'categories',
      ),
    ).toEqual({ limit: 5, offset: 15 });
  });

  it('ignores a non-numeric value', () => {
    expect(parsePaginationParams({ limit: 'not-a-number' })).toEqual({});
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
