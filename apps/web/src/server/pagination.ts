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

function prefixedKey(name: string, prefix: string): string {
  if (!prefix) {
    return name;
  }
  return `${prefix}${name[0]?.toUpperCase()}${name.slice(1)}`;
}

/** A plain, non-empty string query param (search box), optionally prefixed for a page with more than one list. */
export function parseStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  name: string,
  prefix = '',
): string | undefined {
  const raw = searchParams[prefixedKey(name, prefix)];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/**
 * DB-005 ("никакого raw query-to-SQL/Prisma passthrough"): a sort/filter
 * query param is only ever accepted if it is an exact member of the
 * caller-supplied allowlist — defense-in-depth alongside each repository's
 * own explicit `switch` over the same allowlist.
 */
export function parseAllowlistedParam<T extends string>(
  searchParams: Record<string, string | string[] | undefined>,
  name: string,
  allowlist: readonly T[],
  prefix = '',
): T | undefined {
  const value = parseStringParam(searchParams, name, prefix);
  return value !== undefined && (allowlist as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
