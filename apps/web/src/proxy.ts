import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
// (function still receives/returns the same NextRequest/NextResponse
// shape); next-intl's createMiddleware output is used unchanged as the
// proxy's default export. Lives in src/ (not the project root) because the
// app directory is under src/ — Next.js requires proxy.ts at the same level
// as app/.
export default createMiddleware(routing);

export const config = {
  // Excludes API routes, health checks, Next.js internals, and any request
  // for a file with an extension (static assets) from locale handling.
  matcher: ['/((?!api|health|_next|_vercel|.*\\..*).*)'],
};
