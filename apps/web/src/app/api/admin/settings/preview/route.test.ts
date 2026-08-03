import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSettings(
  overrides: Partial<{ canonicalHost: string; crawlerGlobalNoindex: boolean }> = {},
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
// A settingsRepo.update() call from this endpoint would be a real bug — the
// preview route must only ever read. Throwing (rather than silently
// recording a call) makes any future accidental wiring of a write path fail
// this test immediately and loudly, not just show up in a spy assertion.
const settingsUpdate = vi.fn(() => {
  throw new Error(
    'settingsRepo.update() must never be called by the preview endpoint — it is read-only by contract.',
  );
});

vi.mock('@/server/container', () => ({
  getContainer: () => ({ settingsRepo: { get: settingsGet, update: settingsUpdate } }),
}));

vi.mock('@/server/session', () => ({
  requireActor: () => Promise.resolve({ userId: 'admin-1', platformRole: 'ADMIN', companyIds: [] }),
}));

const { GET, POST } = await import('./route.js');

describe('GET/POST /api/admin/settings/preview — never persists', () => {
  beforeEach(() => {
    settingsGet.mockReset();
    settingsUpdate.mockClear();
  });

  it('GET previews the currently-saved settings and never calls settingsRepo.update', async () => {
    settingsGet.mockResolvedValue(makeSettings());

    const response = await GET(new NextRequest('https://example.test/api/admin/settings/preview'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.canonicalOrigin).toBe('https://eramix.example');
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it('POST previews a hypothetical patch without ever persisting it', async () => {
    settingsGet.mockResolvedValue(makeSettings());

    const response = await POST(
      new NextRequest('https://example.test/api/admin/settings/preview', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.test',
          host: 'example.test',
        },
        body: JSON.stringify({
          canonicalHost: 'staging.eramix.example',
          crawlerGlobalNoindex: true,
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // The hypothetical patch is reflected in the *response*, proving the
    // preview actually computed the effective merged state...
    expect(body.canonicalOrigin).toBe('https://staging.eramix.example');
    expect(body.robotsGlobalNoindex).toBe(true);
    // ...but settingsGet is the only repository call made; nothing wrote it.
    expect(settingsGet).toHaveBeenCalledTimes(1);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it('POST rejects an invalid hypothetical patch (merchantCenterEnabled: true) without ever reaching a write call', async () => {
    settingsGet.mockResolvedValue(makeSettings());

    const response = await POST(
      new NextRequest('https://example.test/api/admin/settings/preview', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.test',
          host: 'example.test',
        },
        body: JSON.stringify({ merchantCenterEnabled: true }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    expect(settingsUpdate).not.toHaveBeenCalled();
  });
});
