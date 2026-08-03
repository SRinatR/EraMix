import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSettings(
  overrides: Partial<{ indexNowEnabled: boolean; crawlerGlobalNoindex: boolean }> = {},
) {
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
const engineStatusListAll = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    settingsRepo: { get: settingsGet },
    indexNowEngineStatus: { listAll: engineStatusListAll },
    env: { INDEXNOW_KEY: 'a1b2c3d4e5f6' },
  }),
}));

vi.mock('@/server/session', () => ({
  requireActor: () => Promise.resolve({ userId: 'admin-1', platformRole: 'ADMIN', companyIds: [] }),
}));

const { GET } = await import('./route.js');

describe('GET /api/admin/indexnow/diagnostics', () => {
  beforeEach(() => {
    settingsGet.mockReset();
    engineStatusListAll.mockReset();
  });

  it('returns effectivelyActive/per-engine diagnostics, never the IndexNow key itself', async () => {
    settingsGet.mockResolvedValue(makeSettings({ indexNowEnabled: true }));
    engineStatusListAll.mockResolvedValue([
      {
        engine: 'bing',
        lastAttemptAt: new Date('2026-08-03T10:00:00.000Z'),
        lastSucceeded: true,
        lastStatusCode: 200,
        lastUrlCount: 2,
      },
    ]);

    const response = await GET(
      new NextRequest('https://example.test/api/admin/indexnow/diagnostics'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.effectivelyActive).toBe(true);
    expect(body.keyConfigured).toBe(true);
    expect(body.engines).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('a1b2c3d4e5f6');
  });

  it('reports effectivelyActive: false when the emergency crawlerGlobalNoindex switch is on', async () => {
    settingsGet.mockResolvedValue(
      makeSettings({ indexNowEnabled: true, crawlerGlobalNoindex: true }),
    );
    engineStatusListAll.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('https://example.test/api/admin/indexnow/diagnostics'),
      { params: Promise.resolve({}) },
    );

    const body = await response.json();
    expect(body.effectivelyActive).toBe(false);
  });

  it('405s a POST with a correct Allow header (GET-only route)', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      new NextRequest('https://example.test/api/admin/indexnow/diagnostics', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
