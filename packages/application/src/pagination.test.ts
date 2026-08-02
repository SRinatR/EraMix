import { describe, expect, it } from 'vitest';
import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  encodeCursor,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './pagination.js';

describe('clampLimit', () => {
  it('defaults when no limit is supplied', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('passes through a valid limit', () => {
    expect(clampLimit(10)).toBe(10);
  });

  it('clamps a limit above MAX_PAGE_SIZE (DB-005: bounded queries)', () => {
    expect(clampLimit(100_000)).toBe(MAX_PAGE_SIZE);
  });

  it('clamps a limit below 1 up to 1', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });
});

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a cursor', () => {
    const cursor = encodeCursor({ v: 'widget', id: 'entity-1' });
    expect(decodeCursor(cursor)).toEqual({ v: 'widget', id: 'entity-1' });
  });

  it('round-trips a numeric cursor value', () => {
    const cursor = encodeCursor({ v: 42, id: 'entity-2' });
    expect(decodeCursor(cursor)).toEqual({ v: 42, id: 'entity-2' });
  });

  it('is opaque — not plain base64 of the JSON (base64url-safe, no padding)', () => {
    const cursor = encodeCursor({ v: 'x', id: 'y' });
    expect(cursor).not.toContain('+');
    expect(cursor).not.toContain('/');
    expect(cursor).not.toContain('=');
  });

  it('returns undefined for a missing cursor', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it('returns undefined for a malformed/tampered cursor rather than throwing', () => {
    expect(decodeCursor('not-valid-base64url-json!!!')).toBeUndefined();
    expect(decodeCursor(encodeCursor({ v: 'x', id: 'y' }).slice(0, -2))).toBeUndefined();
  });
});

describe('buildCursorPage', () => {
  const cursorFor = (item: { id: string; name: string }) => ({ v: item.name, id: item.id });

  it('hasMore is false and no nextCursor when fewer than limit+1 rows were fetched', () => {
    const rows = [{ id: '1', name: 'a' }];
    const page = buildCursorPage(rows, 20, cursorFor);
    expect(page.data).toEqual(rows);
    expect(page.page).toEqual({ hasMore: false });
  });

  it('trims the over-fetched row and sets hasMore/nextCursor when exactly limit+1 rows were fetched', () => {
    const rows = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ];
    const page = buildCursorPage(rows, 1, cursorFor);
    expect(page.data).toEqual([{ id: '1', name: 'a' }]);
    expect(page.page.hasMore).toBe(true);
    expect(decodeCursor(page.page.nextCursor)).toEqual({ v: 'a', id: '1' });
  });

  it('handles an empty result set', () => {
    const page = buildCursorPage([], 20, cursorFor);
    expect(page.data).toEqual([]);
    expect(page.page).toEqual({ hasMore: false });
  });
});
