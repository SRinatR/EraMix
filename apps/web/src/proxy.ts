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

// SEC-003 (CSP/XSS): must be built here, per-request, not in
// next.config.ts's headers() (evaluated once, not per request) — a fresh
// cryptographically random nonce is required so Next.js's own inline
// RSC-streaming bootstrap scripts (<script>self.__next_f.push(...)</script>,
// required for hydration, not decorative) and any inline <style> Next
// injects can run without 'unsafe-inline'. Verified live in production
// (Firefox): every such inline script was rejected under the previous
// static `script-src 'self'` policy with no nonce and no 'unsafe-inline'.
//
// Setting the header on BOTH the outgoing request (so Next's own
// server-side renderer can read it back via next/headers during this same
// request and apply the nonce to the scripts/styles it emits — this is
// Next's documented automatic-nonce-propagation contract) and the response
// (so the browser enforces it) is required; setting it on the response
// alone does not reach the renderer.
const isProduction = process.env.NODE_ENV === 'production';

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'unsafe-eval' only outside production — Turbopack's dev-mode HMR
    // runtime needs it; the production bundle this policy protects never
    // gets it.
    `script-src 'self' 'nonce-${nonce}'${isProduction ? '' : " 'unsafe-eval'"}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

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
  // Web Crypto (not Node's node:crypto — the proxy runs on the Edge
  // runtime), 18 random bytes base64-encoded: cryptographically random and
  // unique per request, never a static/reused value.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64');
  const csp = buildCsp(nonce);

  // Mutated in place (Headers instances are mutable even on an existing
  // Request/NextRequest) rather than reconstructing a new NextRequest —
  // reconstructing risks silently losing NextRequest-specific state
  // (.nextUrl, geo, basePath) that next-intl's own middleware depends on.
  // next-intl clones via `new Headers(request.headers)` when building its
  // own NextResponse.next()/rewrite() (verified against the installed
  // next-intl@4.13.4 source, middleware.js), so setting these here means
  // its clone — and therefore the request Next's App Router renderer sees
  // — carries them too. Next's renderer reads the nonce back out of this
  // same request's Content-Security-Policy header via next/headers during
  // this request to apply it to the scripts/styles it emits — a
  // response-only header would never reach the renderer.
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);

  const gone = await checkRetired(request);
  if (gone) {
    gone.headers.set('Content-Security-Policy', csp);
    return gone;
  }

  const response = intlMiddleware(request);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Excludes API routes, health checks, Next.js internals, and any request
  // for a file with an extension (static assets) from locale handling.
  matcher: ['/((?!api|health|_next|_vercel|.*\\..*).*)'],
};
