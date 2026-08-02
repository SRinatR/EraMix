import { AccessDeniedError } from '@eramix/domain';
import type { NextRequest } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/**
 * SEC-002 ("CSRF-защита обязательна для cookie-authenticated
 * state-changing запросов; Origin/Referer policy используется как
 * дополнительный контроль"): every mutating request must be same-origin.
 * `SameSite=lax` on the session cookie (apps/web/src/app/api/auth/{login,
 * callback}/route.ts) is the primary defense — it is not sent at all on a
 * cross-site POST — this is the required additional Origin/Referer check.
 *
 * Compares the browser-declared source origin's host against this
 * request's own `Host` header rather than a configured public origin: a
 * reverse proxy in front of Next.js (the production/staging topology)
 * preserves the original `Host` by default, so this holds regardless of
 * environment without needing PUBLIC_ORIGIN wired through every route.
 */
export function assertSameOrigin(request: NextRequest): void {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return;
  }

  const sourceUrl = request.headers.get('origin') ?? request.headers.get('referer');
  if (!sourceUrl) {
    throw new AccessDeniedError(
      'Missing Origin/Referer header on a state-changing request (CSRF policy).',
      { method },
    );
  }

  const sourceHost = hostOf(sourceUrl);
  const requestHost = request.headers.get('host');
  if (!sourceHost || !requestHost || sourceHost !== requestHost) {
    throw new AccessDeniedError('Cross-origin state-changing request rejected (CSRF policy).', {
      method,
    });
  }
}
