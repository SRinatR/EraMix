import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_AUTH_COOKIE_NAME } from '@/server/session';

const buildAuthorizationRequest = vi.fn();
const encodePendingAuth = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    env: {},
    identityProvider: { buildAuthorizationRequest },
    pendingAuthCodec: { encode: encodePendingAuth },
  }),
}));

const { GET } = await import('./route.js');

describe('GET /api/auth/login', () => {
  beforeEach(() => {
    buildAuthorizationRequest.mockReset();
    encodePendingAuth.mockReset();
  });

  it('redirects (307, never a permanent 308 — this is a one-time OIDC step) to the identity provider, with a pending-auth cookie set', async () => {
    buildAuthorizationRequest.mockResolvedValue({
      authorizationUrl: 'https://idp.example/authorize?client_id=x&state=s1',
      state: 's1',
      nonce: 'n1',
      pkce: { codeVerifier: 'verifier1' },
    });
    encodePendingAuth.mockResolvedValue('encoded-pending-token');

    const response = await GET(new NextRequest('https://example.test/api/auth/login'), {
      params: Promise.resolve({}),
    });

    // NextResponse.redirect()'s own default — verified against the
    // installed next@16.2.12 package source
    // (docs/runbooks/http-error-contract.md).
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://idp.example/authorize?client_id=x&state=s1',
    );
    expect(response.cookies.get(PENDING_AUTH_COOKIE_NAME)?.value).toBe('encoded-pending-token');
  });
});
