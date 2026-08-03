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
 * pair).
 *
 * Checks every shape observed in this project's actual Prisma 7 +
 * `@prisma/adapter-pg` driver-adapter stack, verified against a real CI
 * failure (not assumed): the classic `meta.target` (string or string[]) is
 * checked first, but this driver adapter's real P2002 nests the underlying
 * Postgres error instead — `meta.driverAdapterError.cause.constraint.fields`
 * (an array of quoted column names, e.g. `"publicId"`) and
 * `.cause.originalMessage` (the raw Postgres message, which names the
 * Postgres-auto-generated constraint, e.g. `products_publicId_key`) are
 * both checked as substring matches so this survives either shape.
 */
export function conflictTargetIncludes(
  meta: Record<string, unknown> | undefined,
  column: string,
): boolean {
  if (!meta) {
    return false;
  }
  const target = meta['target'];
  if (typeof target === 'string' && target.includes(column)) {
    return true;
  }
  if (Array.isArray(target) && target.some((t) => typeof t === 'string' && t.includes(column))) {
    return true;
  }

  const driverAdapterError = meta['driverAdapterError'] as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.['cause'] as Record<string, unknown> | undefined;
  const constraint = cause?.['constraint'] as Record<string, unknown> | undefined;
  const fields = constraint?.['fields'];
  if (
    Array.isArray(fields) &&
    fields.some((field) => typeof field === 'string' && field.includes(column))
  ) {
    return true;
  }
  const originalMessage = cause?.['originalMessage'];
  return typeof originalMessage === 'string' && originalMessage.includes(column);
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
