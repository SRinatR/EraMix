import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import type { AuthorizationRequest, IdentityProvider, OidcClaims } from '@eramix/application';
import { generatePkceChallenge, generateRandomToken } from './pkce.js';

interface DiscoveryDocument {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
}

interface TokenResponse {
  readonly id_token?: string;
}

export interface OidcIdentityProviderConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Generic RFC 9700 + OIDC Core Authorization Code + PKCE adapter
 * (packages/application's IdentityProvider port). Issuer/client are
 * env-configured (ADR-0003/Q-01 still blocked on the actual ODS values) —
 * this class contains no ODS-specific assumption: it discovers the
 * authorization/token/JWKS endpoints from the issuer's own
 * `.well-known/openid-configuration`, exactly as any OIDC-compliant IdP
 * requires, and validates state, nonce, PKCE, issuer, audience, signature
 * (via JWKS), and expiration (the last via jose's built-in `exp` check)
 * before ever returning claims.
 */
export class OidcIdentityProvider implements IdentityProvider {
  private discoveryCache: Promise<DiscoveryDocument> | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: OidcIdentityProviderConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private discover(): Promise<DiscoveryDocument> {
    this.discoveryCache ??= (async () => {
      const issuerUrl = this.config.issuer.replace(/\/$/, '');
      const response = await this.fetchImpl(`${issuerUrl}/.well-known/openid-configuration`);
      if (!response.ok) {
        throw new Error(`OIDC discovery request failed with HTTP ${response.status}.`);
      }
      return (await response.json()) as DiscoveryDocument;
    })();
    return this.discoveryCache;
  }

  async buildAuthorizationRequest(redirectUri: string): Promise<AuthorizationRequest> {
    const discovery = await this.discover();
    const state = generateRandomToken();
    const nonce = generateRandomToken();
    const pkce = generatePkceChallenge();

    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', this.config.clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', pkce.codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);

    return { authorizationUrl: authorizationUrl.toString(), state, nonce, pkce };
  }

  async handleCallback(input: {
    readonly code: string;
    readonly state: string;
    readonly expectedState: string;
    readonly expectedNonce: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<OidcClaims> {
    if (input.state !== input.expectedState) {
      throw new Error('OIDC callback state does not match the pending authorization request.');
    }

    const discovery = await this.discover();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.config.clientId,
      code_verifier: input.codeVerifier,
    });
    if (this.config.clientSecret !== undefined) {
      body.set('client_secret', this.config.clientSecret);
    }

    const tokenResponse = await this.fetchImpl(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!tokenResponse.ok) {
      throw new Error(`OIDC token exchange failed with HTTP ${tokenResponse.status}.`);
    }
    const tokenSet = (await tokenResponse.json()) as TokenResponse;
    if (!tokenSet.id_token) {
      throw new Error('OIDC token response did not include an id_token.');
    }

    const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), {
      [customFetch]: this.fetchImpl as unknown as typeof globalThis.fetch,
    });
    const { payload } = await jwtVerify(tokenSet.id_token, jwks, {
      issuer: discovery.issuer,
      audience: this.config.clientId,
    });

    if (payload['nonce'] !== input.expectedNonce) {
      throw new Error('OIDC id_token nonce does not match the pending authorization request.');
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('OIDC id_token is missing a sub claim.');
    }

    const email = typeof payload['email'] === 'string' ? payload['email'] : '';
    const displayName =
      typeof payload['name'] === 'string' && payload['name'].length > 0 ? payload['name'] : email;

    return { issuer: discovery.issuer, subject: payload.sub, email, displayName };
  }
}
