import { getContainer } from '@/server/container';
import { problemResponse } from '@/server/problem-response';
import { PENDING_AUTH_COOKIE_NAME } from '@/server/session';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return problemResponse(error);
  }
}
