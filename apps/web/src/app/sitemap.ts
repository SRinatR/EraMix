import { getContainer } from '@/server/container';
import {
  buildCanonicalOrigin,
  buildSitemapEntries,
  getPlatformSettings,
} from '@eramix/application';
import type { MetadataRoute } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
export const dynamic = 'force-dynamic';

/**
 * CLAUDE.md: "Sitemap contains canonical published routes only." Delegates
 * to packages/application's buildSitemapEntries (unit-tested against fakes
 * — see packages/application/src/sitemap.test.ts); this file only adapts
 * that result to Next.js's MetadataRoute.Sitemap shape and prefixes the
 * canonical origin from PlatformSettings. When the emergency sitewide
 * noindex switch is on, the sitemap is emptied too — belt-and-suspenders
 * alongside robots.ts's disallow-all, since a sitemap entry is itself a
 * mild indexing signal.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const container = getContainer();
  const settings = await getPlatformSettings({ settingsRepo: container.settingsRepo });
  if (settings.crawlerGlobalNoindex) {
    return [];
  }

  const entries = await buildSitemapEntries({
    content: container.content,
    category: container.categories,
    product: container.products,
  });

  const origin = buildCanonicalOrigin(settings);
  return entries.map((entry) => ({
    url: new URL(entry.url, origin).toString(),
    lastModified: entry.lastModified,
  }));
}
