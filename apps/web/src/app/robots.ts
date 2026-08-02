import { getContainer } from '@/server/container';
import { buildCanonicalOrigin, getPlatformSettings } from '@eramix/application';
import type { MetadataRoute } from 'next';

// Reads settings via the composition root; must not be statically
// prerendered at build time (would require a live database).
export const dynamic = 'force-dynamic';

/**
 * search-visibility.md: "robots.txt is generated from the route/indexation
 * policy and canonical host" — canonicalHost/crawlerGlobalNoindex are both
 * PlatformSettings fields, not env-derived or hardcoded. The emergency
 * sitewide-noindex switch disallows everything rather than deleting routes
 * or bypassing publication rules — a temporary crawl block, not a takedown.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const container = getContainer();
  const settings = await getPlatformSettings({ settingsRepo: container.settingsRepo });
  const origin = buildCanonicalOrigin(settings);
  return {
    rules: [
      {
        userAgent: '*',
        ...(settings.crawlerGlobalNoindex
          ? { disallow: '/' }
          : { allow: '/', disallow: ['/api/', '/admin', '/account'] }),
      },
    ],
    sitemap: new URL('/sitemap.xml', origin).toString(),
  };
}
