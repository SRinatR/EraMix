import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { isSecureRequest } from '@/server/request-protocol';
import { PENDING_AUTH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/server/session';
import { AuthCallbackFailedError } from '@eramix/domain';
import { NextResponse } from 'next/server';

const getHandler = withApiHandler('auth.callback', async (request) => {
  enforceRateLimit('auth', request);

  const container = getContainer();
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const pendingToken = request.cookies.get(PENDING_AUTH_COOKIE_NAME)?.value;
  if (!code || !state || !pendingToken) {
    throw new AuthCallbackFailedError(
      'Callback is missing code, state, or the pending-auth cookie.',
    );
  }

  const pending = await container.pendingAuthCodec.decode(pendingToken);
  if (!pending) {
    throw new AuthCallbackFailedError(
      'Pending authorization request expired or was tampered with.',
    );
  }

  const claims = await container.identityProvider
    .handleCallback({
      code,
      state,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    })
    .catch((cause: unknown) => {
      throw new AuthCallbackFailedError('OIDC callback validation failed.', {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    });

  let user = await container.users.findByIssuerAndSubject(claims.issuer, claims.subject);
  if (!user) {
    user = await container.users.create({
      id: await container.idGen.nextId(),
      issuer: claims.issuer,
      subject: claims.subject,
      email: claims.email,
      displayName: claims.displayName || claims.email || claims.subject,
      status: 'ACTIVE',
      platformRole: 'CUSTOMER',
    });
  }

  const memberships = await container.memberships.listByUser(user.id);
  const companyIds = memberships
    .filter((membership) => membership.status === 'ACTIVE')
    .map((membership) => membership.companyId);

  const sessionToken = await container.sessionCodec.encode({
    userId: user.id,
    platformRole: user.platformRole,
    companyIds,
  });

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  response.cookies.delete(PENDING_AUTH_COOKIE_NAME);
  return response;
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
