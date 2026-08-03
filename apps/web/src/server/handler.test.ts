import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { defineRouteHandlers } from './handler';

const context = { params: Promise.resolve({}) };

describe('defineRouteHandlers', () => {
  it('passes an implemented method through unchanged', async () => {
    const handlers = defineRouteHandlers({
      GET: () => Promise.resolve(NextResponse.json({ ok: true })),
    });
    const response = await handlers.GET(new NextRequest('https://example.test/api/x'), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns 405 with a correct Allow header and RFC 9457 body for an unimplemented method (GET-only route)', async () => {
    const handlers = defineRouteHandlers({
      GET: () => Promise.resolve(NextResponse.json({ ok: true })),
    });
    const response = await handlers.POST(
      new NextRequest('https://example.test/api/x', { method: 'POST' }),
      context,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    const body = await response.json();
    expect(body).toMatchObject({ code: 'METHOD_NOT_ALLOWED', status: 405 });
  });

  it('sorts multiple implemented methods into a single comma-separated Allow header', async () => {
    const handlers = defineRouteHandlers({
      POST: () => Promise.resolve(NextResponse.json({ ok: true })),
      GET: () => Promise.resolve(NextResponse.json({ ok: true })),
    });
    const response = await handlers.DELETE(
      new NextRequest('https://example.test/api/x', { method: 'DELETE' }),
      context,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, POST');
  });

  it('every standard method plus OPTIONS is present on the returned object, implemented or not', () => {
    const handlers = defineRouteHandlers({
      PATCH: () => Promise.resolve(NextResponse.json({ ok: true })),
    });
    expect(Object.keys(handlers).sort()).toEqual([
      'DELETE',
      'GET',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
    ]);
  });

  it("OPTIONS reports only the genuinely implemented methods, not the 405-stubbed ones (overrides Next.js's own default)", async () => {
    const handlers = defineRouteHandlers({
      GET: () => Promise.resolve(NextResponse.json({ ok: true })),
      POST: () => Promise.resolve(NextResponse.json({ ok: true })),
    });
    const response = await handlers.OPTIONS(
      new NextRequest('https://example.test/api/x', { method: 'OPTIONS' }),
      context,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST');
  });

  it('OPTIONS omits HEAD when GET is not implemented', async () => {
    const handlers = defineRouteHandlers({
      POST: () => Promise.resolve(NextResponse.json({ ok: true })),
    });
    const response = await handlers.OPTIONS(
      new NextRequest('https://example.test/api/x', { method: 'OPTIONS' }),
      context,
    );
    expect(response.headers.get('allow')).toBe('OPTIONS, POST');
  });
});
