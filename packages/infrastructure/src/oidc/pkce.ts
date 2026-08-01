import { createHash, randomBytes } from 'node:crypto';
import type { PkceChallenge } from '@eramix/application';

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64url');
}

/** RFC 7636 PKCE: a cryptographically random verifier and its S256 challenge. */
export function generatePkceChallenge(): PkceChallenge {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

/** RFC 9700 CSRF mitigation (`state`) / OIDC Core replay mitigation (`nonce`). */
export function generateRandomToken(): string {
  return base64UrlEncode(randomBytes(24));
}
