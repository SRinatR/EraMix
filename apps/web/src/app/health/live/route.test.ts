import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { DELETE, GET, PATCH, POST, PUT } from './route.js';

const context = { params: Promise.resolve({}) };

describe('GET /health/live', () => {
  it('reports ok', async () => {
    const response = await GET(new NextRequest('https://example.test/health/live'), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('unsupported methods on /health/live', () => {
  it.each([
    ['POST', POST],
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    '%s returns 405 with an Allow: GET header (docs/runbooks/http-error-contract.md)',
    async (method, handler) => {
      const response = await handler(
        new NextRequest('https://example.test/health/live', { method }),
        context,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
    },
  );
});
