import { describe, expect, it, vi } from 'vitest';

function makeSettings(
  overrides: Partial<{
    canonicalHost: string;
    forceHttps: boolean;
    crawlerGlobalNoindex: boolean;
  }> = {},
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

const get = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({ settingsRepo: { get } }),
}));

const { default: robots } = await import('./robots.js');

describe('robots.ts', () => {
  it('allows crawling and points to the canonical sitemap when the site is not in the emergency-noindex state', async () => {
    get.mockResolvedValue(makeSettings());

    const result = await robots();

    expect(result.rules).toEqual([
      { userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/account'] },
    ]);
    expect(result.sitemap).toBe('https://eramix.example/sitemap.xml');
  });

  it('disallows everything site-wide when crawlerGlobalNoindex is on (emergency kill switch)', async () => {
    get.mockResolvedValue(makeSettings({ crawlerGlobalNoindex: true }));

    const result = await robots();

    expect(result.rules).toEqual([{ userAgent: '*', disallow: '/' }]);
  });

  it('derives the sitemap origin from PlatformSettings, not a hardcoded host', async () => {
    get.mockResolvedValue(
      makeSettings({ canonicalHost: 'staging.eramix.example', forceHttps: false }),
    );

    const result = await robots();

    expect(result.sitemap).toBe('http://staging.eramix.example/sitemap.xml');
  });
});
