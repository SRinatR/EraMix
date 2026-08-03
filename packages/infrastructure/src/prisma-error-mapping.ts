import { ConcurrencyConflictError } from '@eramix/domain';

interface PrismaKnownRequestError {
  readonly code: string;
  readonly meta?: Record<string, unknown> | undefined;
}

function isPrismaKnownRequestError(error: unknown): error is PrismaKnownRequestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/** Prisma's unique-constraint-violation error code. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * Runs a Prisma write that may violate a unique constraint (e.g. a route
 * slug collision) and converts that specific failure into the caller's
 * chosen typed domain error, so a raw Prisma error never reaches the
 * application layer. Any other error propagates unchanged.
 */
export async function withUniqueConstraintMapping<T>(
  action: () => Promise<T>,
  onConflict: (meta: Record<string, unknown> | undefined) => never,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isPrismaKnownRequestError(error) && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
      onConflict(error.meta);
    }
    throw error;
  }
}

/**
 * Runs an optimistic-concurrency-guarded update (`updateMany({ where: { id,
 * version: expected }, ... })`, which Prisma returns as `{ count }`) and
 * throws ConcurrencyConflictError when zero rows matched — the aggregate was
 * changed by another operation since the caller read `expected`.
 */
/**
 * Disambiguates which column a P2002 unique-constraint violation actually
 * hit, when a single Prisma `.create()` call could plausibly violate more
 * than one unique constraint (e.g. Product.create's nested write can
 * collide on `publicId`, `sku`, or a translation's `(productId, locale)`
 * pair). Prisma's `meta.target` is either an array of column names or a
 * single constraint-name string depending on the underlying error path;
 * `.includes(column)` as a substring check handles both shapes, since a
 * Postgres auto-generated constraint name (e.g. `products_publicId_key`)
 * always contains the column name.
 */
export function conflictTargetIncludes(
  meta: Record<string, unknown> | undefined,
  column: string,
): boolean {
  const target = meta?.['target'];
  if (typeof target === 'string') {
    return target.includes(column);
  }
  if (Array.isArray(target)) {
    return target.includes(column);
  }
  return false;
}

export async function assertOptimisticLockAcquired(
  count: number,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  if (count === 0) {
    throw new ConcurrencyConflictError(message, details);
  }
}
