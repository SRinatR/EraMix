import { AuthRequiredError, type PlatformRole } from '@eramix/domain';
import type { SessionPayload } from '@eramix/infrastructure';
import type { NextRequest } from 'next/server';
import { getContainer } from './container';

export const SESSION_COOKIE_NAME = 'eramix_session';
export const PENDING_AUTH_COOKIE_NAME = 'eramix_pending_auth';

export interface Actor {
  readonly userId: string;
  readonly platformRole: PlatformRole;
  readonly companyIds: readonly string[];
}

function toActor(payload: SessionPayload): Actor {
  return {
    userId: payload.userId,
    platformRole: payload.platformRole,
    companyIds: payload.companyIds,
  };
}

/** Returns undefined when there is no session cookie, or it is missing/expired/tampered — never throws. */
export async function getActor(request: NextRequest): Promise<Actor | undefined> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return undefined;
  }
  const payload = await getContainer().sessionCodec.decode(token);
  return payload ? toActor(payload) : undefined;
}

/** IAM-008: every protected route handler calls this — hidden UI is never the authorization control. */
export async function requireActor(request: NextRequest): Promise<Actor> {
  const actor = await getActor(request);
  if (!actor) {
    throw new AuthRequiredError('A valid session is required for this endpoint.');
  }
  return actor;
}
