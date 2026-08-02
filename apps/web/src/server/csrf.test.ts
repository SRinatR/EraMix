import { AccessDeniedError } from '@eramix/domain';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { assertSameOrigin } from './csrf';

describe('assertSameOrigin', () => {
  it('allows a GET request with no Origin header', () => {
    const request = new NextRequest('https://eramix.example/api/orders', { method: 'GET' });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it('allows a same-origin POST (Origin host matches Host header)', () => {
    const request = new NextRequest('https://eramix.example/api/orders', {
      method: 'POST',
      headers: { origin: 'https://eramix.example', host: 'eramix.example' },
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it('falls back to Referer when Origin is absent', () => {
    const request = new NextRequest('https://eramix.example/api/orders', {
      method: 'POST',
      headers: { referer: 'https://eramix.example/account/orders/new', host: 'eramix.example' },
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it('rejects a cross-origin POST (CSRF)', () => {
    const request = new NextRequest('https://eramix.example/api/orders', {
      method: 'POST',
      headers: { origin: 'https://evil.example', host: 'eramix.example' },
    });
    expect(() => assertSameOrigin(request)).toThrow(AccessDeniedError);
  });

  it('rejects a mutating request with neither Origin nor Referer', () => {
    const request = new NextRequest('https://eramix.example/api/orders', {
      method: 'POST',
      headers: { host: 'eramix.example' },
    });
    expect(() => assertSameOrigin(request)).toThrow(AccessDeniedError);
  });

  it('rejects PATCH/DELETE the same as POST', () => {
    const patchRequest = new NextRequest('https://eramix.example/api/orders/1', {
      method: 'PATCH',
      headers: { origin: 'https://evil.example', host: 'eramix.example' },
    });
    const deleteRequest = new NextRequest('https://eramix.example/api/orders/1', {
      method: 'DELETE',
      headers: { origin: 'https://evil.example', host: 'eramix.example' },
    });
    expect(() => assertSameOrigin(patchRequest)).toThrow(AccessDeniedError);
    expect(() => assertSameOrigin(deleteRequest)).toThrow(AccessDeniedError);
  });
});
