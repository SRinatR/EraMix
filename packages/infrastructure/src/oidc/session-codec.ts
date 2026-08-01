import { SignJWT, jwtVerify } from 'jose';
import type { PlatformRole } from '@eramix/domain';

export interface SessionPayload {
  readonly userId: string;
  readonly platformRole: PlatformRole;
  readonly companyIds: readonly string[];
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 12;

/**
 * Encodes/decodes the stateless session cookie value as a signed (HS256)
 * compact JWT. This never carries the OIDC access/refresh token — only the
 * local user id, platform role, and company memberships — and the cookie
 * itself is set HttpOnly (apps/web/src/server/session.ts), so browser
 * JavaScript can access neither the raw OIDC tokens nor this value
 * (CLAUDE.md security policy).
 */
export class SessionCodec {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  encode(payload: SessionPayload): Promise<string> {
    return new SignJWT({ platformRole: payload.platformRole, companyIds: payload.companyIds })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.userId)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
  }

  /** Returns undefined for a missing/expired/tampered token rather than throwing — callers treat it as "no session". */
  async decode(token: string): Promise<SessionPayload | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key);
      const { sub, platformRole, companyIds } = payload;
      if (
        typeof sub !== 'string' ||
        typeof platformRole !== 'string' ||
        !Array.isArray(companyIds) ||
        !companyIds.every((id) => typeof id === 'string')
      ) {
        return undefined;
      }
      return {
        userId: sub,
        platformRole: platformRole as PlatformRole,
        companyIds: companyIds as string[],
      };
    } catch {
      return undefined;
    }
  }
}
