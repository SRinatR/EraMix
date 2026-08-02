import type { DecodedCursor } from '@eramix/application';

/**
 * ADR-0017: shared keyset-pagination query-building for every Prisma
 * repository's `listAll`/`listByCompany`/`listByEntity`. `field` must
 * always be a column also present, uniquely orderable alongside `id`, on
 * the model being queried — each repository's own `resolve*Sort` function
 * is the explicit allowlist (DB-005) that produces this, never a raw
 * client-supplied field name.
 */
export interface SortSpec {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
  readonly kind: 'date' | 'string' | 'number';
}

function parseCursorValue(spec: SortSpec, raw: string | number): Date | string | number {
  return spec.kind === 'date' ? new Date(raw) : raw;
}

/**
 * Combines an existing filter `where` with the keyset cursor condition via
 * `AND: [filterWhere, cursorWhere]` — never a naive object spread, since a
 * filter that itself uses `OR` (e.g. a multi-field search) would silently
 * collide with the cursor's own `OR` key under a spread.
 */
export function combineWithCursor(
  filterWhere: Record<string, unknown>,
  sortSpec: SortSpec,
  decoded: DecodedCursor | undefined,
): Record<string, unknown> {
  if (!decoded) {
    return filterWhere;
  }
  const op = sortSpec.direction === 'asc' ? 'gt' : 'lt';
  const value = parseCursorValue(sortSpec, decoded.v);
  const cursorWhere = {
    OR: [
      { [sortSpec.field]: { [op]: value } },
      { [sortSpec.field]: value, id: { [op]: decoded.id } },
    ],
  };
  return { AND: [filterWhere, cursorWhere] };
}

/** `id` is always the tiebreaker, in the same direction as the primary sort field, so ordering stays deterministic when the sort field has duplicate values. */
export function buildCursorOrderBy(sortSpec: SortSpec): Record<string, 'asc' | 'desc'>[] {
  return [{ [sortSpec.field]: sortSpec.direction }, { id: sortSpec.direction }];
}

/** Reads the value the cursor should encode from a fetched row for `sortSpec.field`, converting a Date to its ISO string (cursors are JSON-encoded and must be plain string/number). */
export function cursorValueOf(sortSpec: SortSpec, row: Record<string, unknown>): string | number {
  const value = row[sortSpec.field];
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value as string | number;
}
