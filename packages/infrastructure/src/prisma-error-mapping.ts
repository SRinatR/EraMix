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
export async function assertOptimisticLockAcquired(
  count: number,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  if (count === 0) {
    throw new ConcurrencyConflictError(message, details);
  }
}
