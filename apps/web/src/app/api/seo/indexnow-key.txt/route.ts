import { defineRouteHandlers } from '@/server/handler';
import { getContainer } from '@/server/container';
import { NextResponse } from 'next/server';

// Reads the deployment secret (INDEXNOW_KEY) via the composition root; must
// not be statically prerendered at build time.
export const dynamic = 'force-dynamic';

/**
 * IndexNow's required key-ownership verification file (CLAUDE.md: "expose
 * the required verification file"). apps/worker's submissions always pass
 * this URL as `keyLocation` explicitly, so search engines never need to
 * guess a root-relative `/{key}.txt` convention. 404s (never a fabricated
 * placeholder) when INDEXNOW_KEY is unconfigured — fail closed, matching
 * every other secret-gated feature in this codebase.
 */
function getHandler(): Promise<NextResponse> {
  const { env } = getContainer();
  if (env.INDEXNOW_KEY === undefined) {
    return Promise.resolve(new NextResponse('Not found', { status: 404 }));
  }
  return Promise.resolve(
    new NextResponse(env.INDEXNOW_KEY, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
  );
}

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
