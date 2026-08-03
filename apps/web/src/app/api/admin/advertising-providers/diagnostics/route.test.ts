import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'config-1',
    provider: 'GOOGLE_ADS',
    enabled: false,
    consentCategory: 'ADVERTISING',
    accountId: null,
    containerId: null,
    pixelId: null,
    credentialSecretRef: null,
    testMode: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

const listAll = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    advertisingProviders: { listAll },
  }),
}));

vi.mock('@/server/session', () => ({
  requireActor: () => Promise.resolve({ userId: 'admin-1', platformRole: 'ADMIN', companyIds: [] }),
}));

const { GET } = await import('./route.js');

describe('GET /api/admin/advertising-providers/diagnostics', () => {
  beforeEach(() => {
    listAll.mockReset();
  });

  it('returns per-provider diagnostics, never the credential secret reference itself', async () => {
    listAll.mockResolvedValue([
      makeConfig({ credentialSecretRef: 'google-ads-prod-secret' }),
      makeConfig({ provider: 'META', consentCategory: 'ANALYTICS' }),
    ]);

    const response = await GET(
      new NextRequest('https://example.test/api/admin/advertising-providers/diagnostics'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ provider: 'GOOGLE_ADS', credentialConfigured: true });
    expect(JSON.stringify(body)).not.toContain('google-ads-prod-secret');
  });

  it('405s a POST with a correct Allow header (GET-only route)', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      new NextRequest('https://example.test/api/admin/advertising-providers/diagnostics', {
        method: 'POST',
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
