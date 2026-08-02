import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { isSecureRequest } from './request-protocol';

describe('isSecureRequest', () => {
  it('is true for an https:// request URL with no proxy header', () => {
    const request = new NextRequest('https://eramix.example/api/auth/login');
    expect(isSecureRequest(request)).toBe(true);
  });

  it('is false for a plain http:// request URL (e.g. a local Docker demo with no TLS)', () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login');
    expect(isSecureRequest(request)).toBe(false);
  });

  it('trusts x-forwarded-proto: https over a plain-http request URL (TLS terminated at a reverse proxy)', () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(isSecureRequest(request)).toBe(true);
  });

  it('is false when x-forwarded-proto explicitly says http', () => {
    const request = new NextRequest('https://eramix.example/api/auth/login', {
      headers: { 'x-forwarded-proto': 'http' },
    });
    expect(isSecureRequest(request)).toBe(false);
  });

  it('takes the first hop of a comma-separated x-forwarded-proto chain', () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https, http' },
    });
    expect(isSecureRequest(request)).toBe(true);
  });
});
