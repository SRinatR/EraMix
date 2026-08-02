/**
 * Parses `?limit=&offset=` (or, on a page with more than one independently
 * paginated list, `?<prefix>Limit=&<prefix>Offset=`) from a Next.js Server
 * Component's `searchParams` into the shape `clampPagination`
 * (packages/application) expects.
 */
export function parsePaginationParams(
  searchParams: Record<string, string | string[] | undefined>,
  prefix = '',
): { limit?: number; offset?: number } {
  const limitKey = prefix ? `${prefix}Limit` : 'limit';
  const offsetKey = prefix ? `${prefix}Offset` : 'offset';
  const limitRaw = searchParams[limitKey];
  const offsetRaw = searchParams[offsetKey];
  const limit = typeof limitRaw === 'string' ? Number(limitRaw) : undefined;
  const offset = typeof offsetRaw === 'string' ? Number(offsetRaw) : undefined;
  return {
    ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
    ...(offset !== undefined && Number.isFinite(offset) ? { offset } : {}),
  };
}
