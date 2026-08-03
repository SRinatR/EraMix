import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSettings(overrides: Partial<{ ga4Enabled: boolean; ga4MeasurementId: string }> = {}) {
  return {
    id: 'singleton' as const,
    canonicalHost: 'eramix.example',
    forceHttps: true,
    stripTrailingSlash: true,
    crawlerGlobalNoindex: false,
    googleExtendedAllowed: true,
    aiCompatibilityFilesEnabled: false,
    analyticsConsentRequired: true,
    ga4Enabled: false,
    yandexMetricaEnabled: false,
    rustAnalyticsEnabled: false,
    indexNowEnabled: false,
    merchantCenterEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

const settingsGet = vi.fn();
const sinkStatusListAll = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    settingsRepo: { get: settingsGet },
    analyticsSinkStatus: { listAll: sinkStatusListAll },
  }),
}));

vi.mock('@/server/session', () => ({
  requireActor: () => Promise.resolve({ userId: 'admin-1', platformRole: 'ADMIN', companyIds: [] }),
}));

const { GET } = await import('./route.js');

describe('GET /api/admin/analytics/diagnostics', () => {
  beforeEach(() => {
    settingsGet.mockReset();
    sinkStatusListAll.mockReset();
  });

  it('returns per-sink enabled/configValid/last-result diagnostics, never a secret', async () => {
    settingsGet.mockResolvedValue(
      makeSettings({ ga4Enabled: true, ga4MeasurementId: 'G-TEST123' }),
    );
    sinkStatusListAll.mockResolvedValue([
      {
        sink: 'ga4',
        lastAttemptAt: new Date('2026-08-03T10:00:00.000Z'),
        lastSucceeded: true,
        lastSkipped: false,
      },
    ]);

    const response = await GET(
      new NextRequest('https://example.test/api/admin/analytics/diagnostics'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(3);
    const ga4 = body.data.find((d: { sink: string }) => d.sink === 'ga4');
    expect(ga4).toMatchObject({ enabled: true, configValid: true, lastSucceeded: true });
    for (const diagnostic of body.data) {
      expect(diagnostic).not.toHaveProperty('apiSecret');
      expect(JSON.stringify(diagnostic)).not.toContain('G-TEST123');
    }
  });

  it('405s a POST with a correct Allow header (GET-only route)', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      new NextRequest('https://example.test/api/admin/analytics/diagnostics', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
