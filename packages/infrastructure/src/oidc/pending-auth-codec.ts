import { SignJWT, jwtVerify } from 'jose';

export interface PendingAuthPayload {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

const PENDING_AUTH_TTL_SECONDS = 10 * 60;

/**
 * Encodes the PKCE `code_verifier` (and state/nonce/redirectUri) between
 * `/api/auth/login` and `/api/auth/callback` in a short-lived, signed,
 * HttpOnly cookie — the server itself is stateless across requests
 * (no session-store dependency chosen yet, ADR-0006 pending), so this value
 * cannot be kept in memory. Signing (not just HttpOnly) additionally
 * prevents a tampered cookie from fixating a chosen code_verifier/state.
 */
export class PendingAuthCodec {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  encode(payload: PendingAuthPayload): Promise<string> {
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${PENDING_AUTH_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async decode(token: string): Promise<PendingAuthPayload | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key);
      const { state, nonce, codeVerifier, redirectUri } = payload;
      if (
        typeof state !== 'string' ||
        typeof nonce !== 'string' ||
        typeof codeVerifier !== 'string' ||
        typeof redirectUri !== 'string'
      ) {
        return undefined;
      }
      return { state, nonce, codeVerifier, redirectUri };
    } catch {
      return undefined;
    }
  }
}
