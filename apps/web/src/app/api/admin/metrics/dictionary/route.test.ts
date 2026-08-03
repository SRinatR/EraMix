import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/session', () => ({
  requireActor: () => Promise.resolve({ userId: 'admin-1', platformRole: 'ADMIN', companyIds: [] }),
}));

const { GET } = await import('./route.js');

describe('GET /api/admin/metrics/dictionary', () => {
  it('returns the full metric dictionary for an ADMIN actor', async () => {
    const response = await GET(
      new NextRequest('https://example.test/api/admin/metrics/dictionary'),
      {
        params: Promise.resolve({}),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.map((d: { metricId: string }) => d.metricId)).toContain('sessions');
  });

  it('405s a POST with a correct Allow header (GET-only route)', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      new NextRequest('https://example.test/api/admin/metrics/dictionary', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
