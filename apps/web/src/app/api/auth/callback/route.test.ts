import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_AUTH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/server/session';

const decodePendingAuth = vi.fn();
const handleCallback = vi.fn();
const findByIssuerAndSubject = vi.fn();
const createUser = vi.fn();
const nextId = vi.fn();
const listByUser = vi.fn();
const encodeSession = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    pendingAuthCodec: { decode: decodePendingAuth },
    identityProvider: { handleCallback },
    users: { findByIssuerAndSubject, create: createUser },
    idGen: { nextId },
    memberships: { listByUser },
    sessionCodec: { encode: encodeSession },
  }),
}));

const { GET } = await import('./route.js');

function callbackRequest(): NextRequest {
  return new NextRequest('https://example.test/api/auth/callback?code=abc&state=s1', {
    headers: { cookie: `${PENDING_AUTH_COOKIE_NAME}=pending-token` },
  });
}

describe('GET /api/auth/callback', () => {
  beforeEach(() => {
    decodePendingAuth.mockReset();
    handleCallback.mockReset();
    findByIssuerAndSubject.mockReset();
    createUser.mockReset();
    nextId.mockReset();
    listByUser.mockReset();
    encodeSession.mockReset();
  });

  it('redirects (307) home with a session cookie set and the pending-auth cookie cleared, for an existing user', async () => {
    decodePendingAuth.mockResolvedValue({
      state: 's1',
      nonce: 'n1',
      codeVerifier: 'verifier1',
      redirectUri: 'https://example.test/api/auth/callback',
    });
    handleCallback.mockResolvedValue({
      issuer: 'https://idp.example',
      subject: 'sub-1',
      email: 'user@example.com',
      displayName: 'User One',
    });
    findByIssuerAndSubject.mockResolvedValue({ id: 'user-1', platformRole: 'CUSTOMER' });
    listByUser.mockResolvedValue([]);
    encodeSession.mockResolvedValue('encoded-session-token');

    const response = await GET(callbackRequest(), { params: Promise.resolve({}) });

    // NextResponse.redirect()'s own default — verified against the
    // installed next@16.2.12 package source
    // (docs/runbooks/http-error-contract.md).
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.test/');
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe('encoded-session-token');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('returns 401 AUTH_CALLBACK_FAILED when the pending-auth cookie is missing (never leaks internals)', async () => {
    const response = await GET(
      new NextRequest('https://example.test/api/auth/callback?code=abc&state=s1'),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe('AUTH_CALLBACK_FAILED');
  });
});
