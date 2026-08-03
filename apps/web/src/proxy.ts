import { getContainer } from './server/container';
import { buildGoneResponse } from './server/gone-response';
import { routing } from './i18n/routing';
import { isSupportedLocale, splitCatalogSlug, type LocaleCode } from '@eramix/domain';
import {
  resolveCategoryRoute,
  resolveContentRoute,
  resolveProductRoute,
} from '@eramix/application';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (function still receives/returns the same NextRequest/NextResponse
// shape); next-intl's createMiddleware output is used unchanged as the
// proxy's default export. Lives in src/ (not the project root) because the
// app directory is under src/ — Next.js requires proxy.ts at the same level
// as app/.
const intlMiddleware = createMiddleware(routing);

// Matches a *locale-prefixed* content/category/product detail path only —
// the shapes that can ever be durably retired (ADR-0018). Deliberately
// excludes the catalog index (/{locale}/catalog), home, admin, account, and
// every API/health/static path, so the extra DB check this proxy performs
// never runs for the vast majority of requests.
const RETIRABLE_PATH = /^\/([a-z]{2})\/(articles|pages|catalog)\/([^/]+)\/?$/;

/**
 * Maps a 'retired' resolution to the correct response: a one-hop `308` when
 * the retired entity names a still-live, still-published successor
 * (search-visibility.md: "a 308 is used only for a materially equivalent
 * canonical replacement"), otherwise the existing real HTTP `410` (ADR-0018).
 * `NextResponse.redirect(url, 308)` is used directly rather than
 * `permanentRedirect()` (a `page.tsx`-only API) since this runs in the proxy.
 */
function retiredResponse(
  request: NextRequest,
  resolution: {
    readonly retirementReason: string | undefined;
    readonly successorCanonicalUrl?: string | undefined;
  },
  locale: LocaleCode,
): NextResponse {
  if (resolution.successorCanonicalUrl !== undefined) {
    return NextResponse.redirect(new URL(resolution.successorCanonicalUrl, request.url), 308);
  }
  return buildGoneResponse(locale, resolution.retirementReason);
}

/**
 * Real HTTP 410/308 for a durably retired content/category/product route —
 * the one Next.js surface that can set an arbitrary status code with a real
 * response body before the App Router renders anything (ADR-0018).
 * Returns undefined (fall through to next-intl) for every non-matching or
 * non-retired request.
 */
async function checkRetired(request: NextRequest): Promise<NextResponse | undefined> {
  const match = RETIRABLE_PATH.exec(request.nextUrl.pathname);
  if (!match) {
    return undefined;
  }
  const [, rawLocale, segment, slug] = match;
  if (rawLocale === undefined || segment === undefined || slug === undefined) {
    return undefined;
  }
  if (!isSupportedLocale(rawLocale)) {
    return undefined;
  }
  const locale: LocaleCode = rawLocale;
  const container = getContainer();

  if (segment === 'articles' || segment === 'pages') {
    const namespace = segment === 'articles' ? 'ARTICLES' : 'PAGES';
    const resolution = await resolveContentRoute(container.content, namespace, locale, slug);
    return resolution.kind === 'retired' ? retiredResponse(request, resolution, locale) : undefined;
  }

  // segment === 'catalog': disambiguate product ({publicId}-{slug}) vs. category (plain slug).
  const asProduct = splitCatalogSlug(slug);
  if (asProduct) {
    const resolution = await resolveProductRoute(
      container.products,
      asProduct.publicId,
      locale,
      asProduct.rest,
    );
    return resolution.kind === 'retired' ? retiredResponse(request, resolution, locale) : undefined;
  }
  const resolution = await resolveCategoryRoute(container.categories, locale, slug);
  return resolution.kind === 'retired' ? retiredResponse(request, resolution, locale) : undefined;
}

export default async function proxy(request: NextRequest) {
  const gone = await checkRetired(request);
  if (gone) {
    return gone;
  }
  return intlMiddleware(request);
}

export const config = {
  // Excludes API routes, health checks, Next.js internals, and any request
  // for a file with an extension (static assets) from locale handling.
  matcher: ['/((?!api|health|_next|_vercel|.*\\..*).*)'],
};
