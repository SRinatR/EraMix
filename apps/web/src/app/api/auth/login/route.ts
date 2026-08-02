import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { isSecureRequest } from '@/server/request-protocol';
import { PENDING_AUTH_COOKIE_NAME } from '@/server/session';
import { NextResponse } from 'next/server';

export const GET = withApiHandler('auth.login', async (request) => {
  enforceRateLimit('auth', request);

  const container = getContainer();
  const redirectUri =
    container.env.OIDC_REDIRECT_URI ?? new URL('/api/auth/callback', request.url).toString();
  const authorizationRequest =
    await container.identityProvider.buildAuthorizationRequest(redirectUri);
  const pendingToken = await container.pendingAuthCodec.encode({
    state: authorizationRequest.state,
    nonce: authorizationRequest.nonce,
    codeVerifier: authorizationRequest.pkce.codeVerifier,
    redirectUri,
  });

  const response = NextResponse.redirect(authorizationRequest.authorizationUrl);
  response.cookies.set(PENDING_AUTH_COOKIE_NAME, pendingToken, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
});
