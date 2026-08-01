import { getContainer } from '@/server/container';
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

/** Readiness fails (503) when the required PostgreSQL dependency is unreachable — never reports ready without checking it. */
export async function GET(): Promise<NextResponse> {
  if (!(await isDatabaseReachable())) {
    return NextResponse.json(
      {
        type: 'https://eramix.dev/problems/dependency-unavailable',
        title: 'Критическая зависимость временно недоступна',
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        detail: 'PostgreSQL is unreachable.',
      },
      { status: 503, headers: { 'content-type': 'application/problem+json' } },
    );
  }
  return NextResponse.json({ status: 'ok' });
}
