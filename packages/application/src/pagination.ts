/**
 * DB-005 ("Индексы проектируются по реальным query paths; все list
 * endpoints имеют bounded queries и пагинацию") / ADM-002 ("Все списки
 * имеют серверную пагинацию..."): every list-shaped repository method
 * funnels its limit/offset through `clampPagination` so no caller —
 * internal or external — can request an unbounded result set, and every
 * such method returns this same `Page<T>` shape.
 */
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface PaginationInput {
  readonly limit?: number;
  readonly offset?: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function clampPagination(input: PaginationInput): { limit: number; offset: number } {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(input.offset ?? 0, 0);
  return { limit, offset };
}
