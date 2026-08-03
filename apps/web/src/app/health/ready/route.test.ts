import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
  }),
}));

const { GET, OPTIONS, POST } = await import('./route.js');

describe('GET /health/ready', () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('returns 200 {status: "ok"} when PostgreSQL is reachable', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET(new NextRequest('https://example.test/health/ready'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns an RFC 9457 Problem Details 503 (English, via the shared pipeline, no Retry-After) when PostgreSQL is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await GET(new NextRequest('https://example.test/health/ready'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('retry-after')).toBeNull();
    const body = await response.json();
    expect(body.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(body.title).toBe('A critical dependency is temporarily unavailable');
    expect(body.status).toBe(503);
  });

  it('405s a POST with a correct Allow header (GET-only route)', async () => {
    const response = await POST(
      new NextRequest('https://example.test/health/ready', { method: 'POST' }),
      {
        params: Promise.resolve({}),
      },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });

  it('OPTIONS reports the true implemented method set', async () => {
    const response = await OPTIONS(
      new NextRequest('https://example.test/health/ready', { method: 'OPTIONS' }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  });
});
