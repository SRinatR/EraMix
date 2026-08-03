import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const settingsGet = vi.fn();
const listPublishedContent = vi.fn();
const listPublishedCategories = vi.fn();
const listPublishedProducts = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    settingsRepo: { get: settingsGet },
    content: { listPublished: listPublishedContent },
    categories: { listPublished: listPublishedCategories },
    products: { listPublished: listPublishedProducts },
  }),
}));

const { default: sitemap } = await import('./sitemap.js');

describe('sitemap.ts', () => {
  beforeEach(() => {
    settingsGet.mockReset();
    listPublishedContent.mockReset();
    listPublishedCategories.mockReset();
    listPublishedProducts.mockReset();
  });

  it('prefixes every entry with the canonical origin from PlatformSettings, never a hardcoded host', async () => {
    settingsGet.mockResolvedValue(makeSettings());
    listPublishedContent.mockResolvedValue([]);
    listPublishedCategories.mockResolvedValue([
      {
        id: 'category-1',
        status: 'PUBLISHED',
        sortOrder: 0,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        version: 0,
        translations: [
          {
            id: 't-1',
            categoryId: 'category-1',
            locale: 'en',
            name: 'Widgets',
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 0,
            routes: [
              {
                id: 'route-1',
                translationId: 't-1',
                locale: 'en',
                slug: 'widgets',
                isCanonical: true,
                createdAt: new Date(),
              },
            ],
          },
        ],
      },
    ]);
    listPublishedProducts.mockResolvedValue({ data: [], page: { hasMore: false } });

    const entries = await sitemap();

    expect(entries).toEqual([
      { url: 'https://eramix.example/en/catalog/widgets', lastModified: new Date('2026-01-02') },
    ]);
  });

  it('returns an empty sitemap when crawlerGlobalNoindex is on, never touching the repositories (belt-and-suspenders alongside robots.ts)', async () => {
    settingsGet.mockResolvedValue(makeSettings({ crawlerGlobalNoindex: true }));

    const entries = await sitemap();

    expect(entries).toEqual([]);
    expect(listPublishedContent).not.toHaveBeenCalled();
    expect(listPublishedCategories).not.toHaveBeenCalled();
    expect(listPublishedProducts).not.toHaveBeenCalled();
  });
});
