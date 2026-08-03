import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { getContainer } from '@/server/container';
import { DependencyUnavailableError } from '@eramix/domain';
import { NextResponse } from 'next/server';

const DB_CHECK_TIMEOUT_MS = 2000;

async function isDatabaseReachable(): Promise<boolean> {
  try {
    const { prisma } = getContainer();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('readiness DB check timed out')), DB_CHECK_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Readiness fails (503) when the required PostgreSQL dependency is
 * unreachable — never reports ready without checking it. Throws through the
 * shared `withApiHandler`/`problemResponse` pipeline (docs/runbooks/
 * http-error-contract.md: "a route handler must never construct its own
 * status/body for a caught error") instead of hand-building a response, so
 * this route gets the same English-only Problem Details shape, trace-id
 * correlation, and structured logging as every other route.
 */
const readyHandler = withApiHandler('health.ready', async () => {
  if (!(await isDatabaseReachable())) {
    throw new DependencyUnavailableError('PostgreSQL is unreachable.');
  }
  return NextResponse.json({ status: 'ok' });
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: readyHandler,
});
