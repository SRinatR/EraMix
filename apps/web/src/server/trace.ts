import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * W3C Trace Context (CLAUDE.md): reuses an inbound `traceparent` header's
 * trace-id when present (e.g. forwarded by an upstream proxy/collector),
 * otherwise mints a fresh 32-hex-char trace-id. A v4 UUID's 32 hex digits
 * (36 chars minus 4 dashes) are exactly the required length, so no extra
 * random-bytes dependency is needed here.
 */
export function traceIdFromRequest(request: NextRequest): string {
  const traceparent = request.headers.get('traceparent');
  if (traceparent) {
    const parts = traceparent.split('-');
    const candidate = parts[1];
    if (parts.length === 4 && candidate?.length === 32) {
      return candidate;
    }
  }
  return randomUUID().replaceAll('-', '');
}
