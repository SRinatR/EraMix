#!/usr/bin/env node
// Performs a real HTTP OIDC Authorization Code + PKCE login against a
// running EraMix app + scripts/pi/oidc-fake-idp.mjs, exactly as a browser
// would (follows the same three redirects, carries the pending-auth cookie
// forward), and prints the resulting session cookie value to stdout.
//
// Usage: node scripts/pi/login-as.mjs <customer|manager|editor|admin|auditor> [appBaseUrl]
// Requires: the app running with OIDC_ISSUER_URL pointed at the fake IdP,
// and packages/infrastructure's db:seed:e2e already run (see README.md).

const role = process.argv[2];
const appBaseUrl = process.argv[3] ?? 'http://localhost:3000';

if (!role) {
  console.error('Usage: node scripts/pi/login-as.mjs <role> [appBaseUrl]');
  process.exit(1);
}

function firstCookiePair(setCookieHeader) {
  // "name=value; Path=/; HttpOnly; ..." -> "name=value"
  return setCookieHeader.split(';')[0];
}

async function main() {
  // Step 1: GET /api/auth/login — captures the pending-auth cookie and the
  // redirect to the fake IdP's /authorize.
  const loginResponse = await fetch(new URL('/api/auth/login', appBaseUrl), {
    redirect: 'manual',
  });
  if (loginResponse.status !== 302 && loginResponse.status !== 307) {
    throw new Error(`Expected a redirect from /api/auth/login, got ${loginResponse.status}`);
  }
  const pendingCookie = firstCookiePair(loginResponse.headers.get('set-cookie') ?? '');
  const authorizeUrl = new URL(loginResponse.headers.get('location'));

  // Step 2: GET the IdP's /authorize with the scripted &as=<role> shortcut —
  // captures the redirect back to our own /api/auth/callback with ?code=&state=.
  authorizeUrl.searchParams.set('as', role);
  const authorizeResponse = await fetch(authorizeUrl, { redirect: 'manual' });
  if (authorizeResponse.status !== 302) {
    throw new Error(
      `Expected a redirect from the IdP's /authorize, got ${authorizeResponse.status}`,
    );
  }
  const callbackUrl = new URL(authorizeResponse.headers.get('location'));

  // Step 3: GET our own /api/auth/callback, carrying the pending-auth cookie
  // — captures the session cookie.
  const callbackResponse = await fetch(callbackUrl, {
    redirect: 'manual',
    headers: { cookie: pendingCookie },
  });
  if (callbackResponse.status !== 302) {
    const body = await callbackResponse.text();
    throw new Error(
      `Expected a redirect from /api/auth/callback, got ${callbackResponse.status}: ${body}`,
    );
  }
  const sessionCookie = firstCookiePair(callbackResponse.headers.get('set-cookie') ?? '');
  if (!sessionCookie) {
    throw new Error('/api/auth/callback did not set a session cookie.');
  }

  console.log(sessionCookie);
}

main().catch((error) => {
  console.error(String(error?.stack ?? error));
  process.exit(1);
});
