import type { NextRequest } from 'next/server';

/**
 * Whether the browser actually reached this request over HTTPS — checked
 * from the real request, not inferred from NODE_ENV, since a
 * production deployment can legitimately terminate TLS at a trusted reverse
 * proxy (in which case `x-forwarded-proto` says `https` even though Next.js
 * itself received plain HTTP) or run with no TLS at all (a local Docker
 * demo deployment on the Pi). A cookie marked `Secure` when the request
 * wasn't actually HTTPS is silently dropped by every real browser — masking
 * a completely broken login flow as "it redirected, so it must have
 * worked." `secure: isSecureRequest(request)` matches the cookie's
 * `Secure` attribute to what the browser will really do.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https';
  }
  return new URL(request.url).protocol === 'https:';
}
