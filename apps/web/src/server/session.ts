import { AuthRequiredError, type Membership, type PlatformRole } from '@eramix/domain';
import type { SessionPayload } from '@eramix/infrastructure';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getContainer } from './container';

export const SESSION_COOKIE_NAME = 'eramix_session';
export const PENDING_AUTH_COOKIE_NAME = 'eramix_pending_auth';

export interface Actor {
  readonly userId: string;
  readonly platformRole: PlatformRole;
  readonly companyIds: readonly string[];
}

/**
 * Only `ACTIVE` memberships grant order-company access — `INVITED` (not
 * yet accepted) and `REVOKED` never do. Split out as a pure function so the
 * filter itself is unit-testable without a database (see
 * `session.test.ts`); `liveActiveCompanyIds` below is the thin DB-fetching
 * wrapper actually used by every request.
 */
export function activeCompanyIds(memberships: readonly Membership[]): readonly string[] {
  return memberships
    .filter((membership) => membership.status === 'ACTIVE')
    .map((membership) => membership.companyId);
}

/**
 * `companyIds` is deliberately re-derived from the database on every
 * request, never trusted from the signed session payload: the session
 * cookie is only refreshed on login, so a membership an admin revokes
 * mid-session would otherwise stay silently granted until the customer
 * next logs out and back in. Enforced here once for every consumer
 * (list/detail/comments/line-edit/submit all read `actor.companyIds`)
 * rather than at each call site.
 */
async function liveActiveCompanyIds(userId: string): Promise<readonly string[]> {
  const memberships = await getContainer().memberships.listByUser(userId);
  return activeCompanyIds(memberships);
}

function toActor(payload: SessionPayload, companyIds: readonly string[]): Actor {
  return {
    userId: payload.userId,
    platformRole: payload.platformRole,
    companyIds,
  };
}

/** Returns undefined when there is no session cookie, or it is missing/expired/tampered — never throws. */
export async function getActor(request: NextRequest): Promise<Actor | undefined> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return undefined;
  }
  const payload = await getContainer().sessionCodec.decode(token);
  if (!payload) {
    return undefined;
  }
  return toActor(payload, await liveActiveCompanyIds(payload.userId));
}

/** IAM-008: every protected route handler calls this — hidden UI is never the authorization control. */
export async function requireActor(request: NextRequest): Promise<Actor> {
  const actor = await getActor(request);
  if (!actor) {
    throw new AuthRequiredError('A valid session is required for this endpoint.');
  }
  return actor;
}

/**
 * Server Component / Server Action equivalent of getActor — reads the
 * session cookie via next/headers instead of a NextRequest (Server
 * Components render without one). Never throws; returns undefined for no
 * session.
 */
export async function getServerActor(): Promise<Actor | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return undefined;
  }
  const payload = await getContainer().sessionCodec.decode(token);
  if (!payload) {
    return undefined;
  }
  return toActor(payload, await liveActiveCompanyIds(payload.userId));
}
