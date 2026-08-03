import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/session', () => ({
  requireActor: () => Promise.resolve({ userId: 'admin-1', platformRole: 'ADMIN', companyIds: [] }),
}));

const { POST } = await import('./route.js');

function postRequest(body: unknown) {
  return new NextRequest('https://example.test/api/admin/metrics/compare', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://example.test',
      host: 'example.test',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/metrics/compare', () => {
  it('normalizes source-native measurements without merging them into a single value', async () => {
    const response = await POST(
      postRequest({
        metricId: 'sessions',
        measurements: [
          {
            source: 'ga4',
            metricId: 'sessions',
            value: 1000,
            periodStart: '2026-08-01',
            periodEnd: '2026-08-01',
          },
          {
            source: 'yandex_metrica',
            metricId: 'sessions',
            value: 900,
            periodStart: '2026-08-01',
            periodEnd: '2026-08-01',
          },
        ],
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries.map((e: { value: number }) => e.value)).toEqual([1000, 900]);
    expect(body).not.toHaveProperty('mergedValue');
    expect(body.discrepancies).toHaveLength(1);
  });

  it('422s a request with an unknown metricId (zod enum rejection)', async () => {
    const response = await POST(
      postRequest({
        metricId: 'not_a_real_metric',
        measurements: [
          {
            source: 'ga4',
            metricId: 'sessions',
            value: 1000,
            periodStart: '2026-08-01',
            periodEnd: '2026-08-01',
          },
        ],
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it('422s a request with an empty measurements array', async () => {
    const response = await POST(postRequest({ metricId: 'sessions', measurements: [] }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(422);
  });

  it('405s a GET (POST-only route)', async () => {
    const { GET } = await import('./route.js');
    const response = await GET(new NextRequest('https://example.test/api/admin/metrics/compare'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});
