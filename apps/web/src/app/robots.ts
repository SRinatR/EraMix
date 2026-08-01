import { getContainer } from '@/server/container';
import type { MetadataRoute } from 'next';

// Reads env via the composition root; must not be statically prerendered at
// build time (would require DATABASE_URL to construct the container).
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const container = getContainer();
  const origin = container.env.PUBLIC_ORIGIN ?? 'https://eramix.example';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/account'] }],
    sitemap: new URL('/sitemap.xml', origin).toString(),
  };
}
