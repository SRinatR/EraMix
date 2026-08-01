import { getContainer } from '@/server/container';
import { buildSitemapEntries } from '@eramix/application';
import type { MetadataRoute } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
export const dynamic = 'force-dynamic';

/**
 * CLAUDE.md: "Sitemap contains canonical published routes only." Delegates
 * to packages/application's buildSitemapEntries (unit-tested against fakes
 * — see packages/application/src/sitemap.test.ts); this file only adapts
 * that result to Next.js's MetadataRoute.Sitemap shape and prefixes the
 * absolute origin, since the application layer only knows path-relative
 * canonical URLs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const container = getContainer();
  const entries = await buildSitemapEntries({
    content: container.content,
    category: container.categories,
    product: container.products,
  });

  const origin = container.env.PUBLIC_ORIGIN ?? 'https://eramix.example';
  return entries.map((entry) => ({
    url: new URL(entry.url, origin).toString(),
    lastModified: entry.lastModified,
  }));
}
