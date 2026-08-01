import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { OidcIdentityProvider } from './oidc-identity-provider.js';

const ISSUER = 'https://idp.test.invalid';
const CLIENT_ID = 'eramix-web';
const REDIRECT_URI = 'https://eramix.test.invalid/auth/callback';

async function buildTestIdp() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'test-key-1' };

  const discovery = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
  };

  async function signIdToken(claims: Record<string, unknown>): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  return { discovery, jwk, signIdToken };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OidcIdentityProvider.buildAuthorizationRequest', () => {
  it('discovers the authorization endpoint and includes state/nonce/PKCE S256 challenge', async () => {
    const { discovery } = await buildTestIdp();
    const fetchImpl = (async (url: string) => {
      expect(url).toBe(`${ISSUER}/.well-known/openid-configuration`);
      return jsonResponse(discovery);
    }) as unknown as typeof fetch;

    const provider = new OidcIdentityProvider({ issuer: ISSUER, clientId: CLIENT_ID, fetchImpl });
    const request = await provider.buildAuthorizationRequest(REDIRECT_URI);

    const url = new URL(request.authorizationUrl);
    expect(url.origin + url.pathname).toBe(discovery.authorization_endpoint);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe(request.state);
    expect(url.searchParams.get('nonce')).toBe(request.nonce);
    expect(url.searchParams.get('code_challenge')).toBe(request.pkce.codeChallenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(request.state).not.toBe(request.nonce);
  });
});

describe('OidcIdentityProvider.handleCallback', () => {
  it('validates state, exchanges the code, verifies the id_token via JWKS, checks nonce, and returns claims', async () => {
    const { discovery, jwk, signIdToken } = await buildTestIdp();
    const idToken = await signIdToken({
      sub: 'user-123',
      email: 'someone@example.com',
      name: 'Someone Example',
      nonce: 'expected-nonce',
    });

    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url === `${ISSUER}/.well-known/openid-configuration`) {
        return jsonResponse(discovery);
      }
      if (url === discovery.token_endpoint) {
        expect(init?.method).toBe('POST');
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('code')).toBe('auth-code-1');
        expect(body.get('code_verifier')).toBe('verifier-1');
        return jsonResponse({ id_token: idToken });
      }
      if (url === discovery.jwks_uri) {
        return jsonResponse({ keys: [jwk] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const provider = new OidcIdentityProvider({ issuer: ISSUER, clientId: CLIENT_ID, fetchImpl });

    const claims = await provider.handleCallback({
      code: 'auth-code-1',
      state: 'state-1',
      expectedState: 'state-1',
      expectedNonce: 'expected-nonce',
      codeVerifier: 'verifier-1',
      redirectUri: REDIRECT_URI,
    });

    expect(claims).toEqual({
      issuer: ISSUER,
      subject: 'user-123',
      email: 'someone@example.com',
      displayName: 'Someone Example',
    });
  });

  it('rejects a callback whose state does not match the pending authorization request (CSRF)', async () => {
    const { discovery } = await buildTestIdp();
    const fetchImpl = (async () => jsonResponse(discovery)) as unknown as typeof fetch;
    const provider = new OidcIdentityProvider({ issuer: ISSUER, clientId: CLIENT_ID, fetchImpl });

    await expect(
      provider.handleCallback({
        code: 'auth-code-1',
        state: 'attacker-state',
        expectedState: 'state-1',
        expectedNonce: 'expected-nonce',
        codeVerifier: 'verifier-1',
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow(/state/);
  });

  it('rejects an id_token whose nonce does not match the pending authorization request (replay mitigation)', async () => {
    const { discovery, jwk, signIdToken } = await buildTestIdp();
    const idToken = await signIdToken({ sub: 'user-123', nonce: 'wrong-nonce' });
    const fetchImpl = (async (url: string) => {
      if (url === `${ISSUER}/.well-known/openid-configuration`) return jsonResponse(discovery);
      if (url === discovery.token_endpoint) return jsonResponse({ id_token: idToken });
      if (url === discovery.jwks_uri) return jsonResponse({ keys: [jwk] });
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    const provider = new OidcIdentityProvider({ issuer: ISSUER, clientId: CLIENT_ID, fetchImpl });

    await expect(
      provider.handleCallback({
        code: 'auth-code-1',
        state: 'state-1',
        expectedState: 'state-1',
        expectedNonce: 'expected-nonce',
        codeVerifier: 'verifier-1',
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow(/nonce/);
  });

  it('rejects an id_token signed by a key not in the issuer JWKS (signature/issuer forgery)', async () => {
    const { discovery, signIdToken } = await buildTestIdp();
    const { publicKey: otherPublicKey } = await generateKeyPair('RS256');
    const idToken = await signIdToken({ sub: 'user-123', nonce: 'expected-nonce' });
    const fetchImpl = (async (url: string) => {
      if (url === `${ISSUER}/.well-known/openid-configuration`) return jsonResponse(discovery);
      if (url === discovery.token_endpoint) return jsonResponse({ id_token: idToken });
      if (url === discovery.jwks_uri) {
        // Serve a JWKS that does NOT contain the key that actually signed the token.
        const wrongJwk = {
          ...(await exportJWK(otherPublicKey)),
          alg: 'RS256',
          use: 'sig',
          kid: 'test-key-1',
        };
        return jsonResponse({ keys: [wrongJwk] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    const provider = new OidcIdentityProvider({ issuer: ISSUER, clientId: CLIENT_ID, fetchImpl });

    await expect(
      provider.handleCallback({
        code: 'auth-code-1',
        state: 'state-1',
        expectedState: 'state-1',
        expectedNonce: 'expected-nonce',
        codeVerifier: 'verifier-1',
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toThrow();
  });
});
