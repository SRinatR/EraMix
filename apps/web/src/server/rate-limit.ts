import { RateLimitedError } from '@eramix/domain';
import { InMemoryRateLimiter } from '@eramix/infrastructure';
import type { NextRequest } from 'next/server';

/**
 * CLAUDE.md: "Apply rate limits to authentication, search, order
 * submission, uploads, and admin operations." One in-memory limiter per
 * bucket, module-scoped so it survives across requests within one server
 * process (see InMemoryRateLimiter's own single-instance caveat).
 */
const limiters = {
  auth: new InMemoryRateLimiter(10, 60_000),
  search: new InMemoryRateLimiter(60, 60_000),
  orderSubmit: new InMemoryRateLimiter(20, 60_000),
  upload: new InMemoryRateLimiter(20, 60_000),
  admin: new InMemoryRateLimiter(100, 60_000),
} as const;

export type RateLimitBucket = keyof typeof limiters;

function clientKey(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** Throws RateLimitedError (mapped to 429 + Retry-After by problemResponse) when the bucket's limit is exceeded for this client. */
export function enforceRateLimit(bucket: RateLimitBucket, request: NextRequest): void {
  const result = limiters[bucket].consume(clientKey(request));
  if (!result.allowed) {
    throw new RateLimitedError(
      `Rate limit exceeded for "${bucket}".`,
      result.retryAfterSeconds ?? 60,
    );
  }
}
