import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { traceIdFromRequest } from './trace';

describe('traceIdFromRequest', () => {
  it('reuses the trace-id from a valid inbound W3C traceparent header', () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const request = new NextRequest('https://example.test/api/x', {
      headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
    });
    expect(traceIdFromRequest(request)).toBe(traceId);
  });

  it('mints a fresh 32-hex-char trace-id when no traceparent header is present', () => {
    const request = new NextRequest('https://example.test/api/x');
    const traceId = traceIdFromRequest(request);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('mints a fresh trace-id when the traceparent header is malformed', () => {
    const request = new NextRequest('https://example.test/api/x', {
      headers: { traceparent: 'not-a-real-traceparent' },
    });
    const traceId = traceIdFromRequest(request);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
