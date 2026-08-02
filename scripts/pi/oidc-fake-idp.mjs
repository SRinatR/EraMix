#!/usr/bin/env node
// Zero-dependency (Node built-ins only — node:http, node:crypto) fake OIDC
// Authorization Code + PKCE identity provider, wire-compatible with
// packages/infrastructure/src/oidc/oidc-identity-provider.ts:
//   - GET  {issuer}/.well-known/openid-configuration
//   - GET  {issuer}/authorize  (renders a login picker, then redirects back
//     to redirect_uri with ?code=...&state=...)
//   - POST {issuer}/token      (authorization_code grant, verifies PKCE
//     S256 code_verifier against the stored code_challenge)
//   - GET  {issuer}/jwks
//
// Purpose: let the Pi E2E suite (and manual smoke testing) exercise a REAL
// HTTP OIDC Authorization Code + PKCE round trip — real discovery, a real
// authorization redirect, a real token exchange, a real RS256-signed and
// JWKS-verified id_token — against fixed test identities, without needing
// real ODS credentials (still blocked on Q-01/ADR-0003). This is a test
// double for the identity *provider*, not a replacement for verifying
// against the real ODS issuer once Q-01 resolves.
//
// Usage: node scripts/pi/oidc-fake-idp.mjs [port]
// Then point the app at it (in .env):
//   OIDC_ISSUER_URL=http://localhost:9099
//   OIDC_CLIENT_ID=eramix-web
//   OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback
// The (issuer, subject) pairs below must match packages/infrastructure/
// prisma/seed-e2e.ts's fixtures exactly.

import { createServer } from 'node:http';
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto';

const PORT = Number(process.argv[2] ?? process.env.E2E_OIDC_PORT ?? 9099);
const ISSUER = process.env.E2E_OIDC_ISSUER ?? `http://localhost:${PORT}`;
const KEY_ID = 'e2e-fake-idp-key-1';

const TEST_USERS = {
  customer: { sub: 'e2e-customer', email: 'customer@e2e.test', name: 'E2E Customer' },
  manager: { sub: 'e2e-manager', email: 'manager@e2e.test', name: 'E2E Manager' },
  editor: { sub: 'e2e-editor', email: 'editor@e2e.test', name: 'E2E Editor' },
  admin: { sub: 'e2e-admin', email: 'admin@e2e.test', name: 'E2E Admin' },
  auditor: { sub: 'e2e-auditor', email: 'auditor@e2e.test', name: 'E2E Auditor' },
};

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', use: 'sig', kid: KEY_ID };

// code -> { clientId, redirectUri, codeChallenge, nonce, userKey, expiresAt } (single use, in-memory, dev-only).
const pendingCodes = new Map();

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signIdToken({ clientId, sub, email, name, nonce }) {
  const header = { alg: 'RS256', typ: 'JWT', kid: KEY_ID };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    aud: clientId,
    sub,
    email,
    name,
    nonce,
    iat: now,
    exp: now + 300,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey)
    .toString('base64url');
  return `${signingInput}.${signature}`;
}

async function verifyPkce(codeVerifier, codeChallenge) {
  const { createHash } = await import('node:crypto');
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}

function loginPageHtml(query) {
  const options = Object.entries(TEST_USERS)
    .map(([key, u]) => `<button name="as" value="${key}">${u.name} (${u.email})</button>`)
    .join('\n');
  return `<!doctype html><html><body>
    <h1>Fake OIDC IdP — pick a test identity</h1>
    <form method="POST" action="/authorize/complete">
      <input type="hidden" name="query" value="${encodeURIComponent(JSON.stringify(query))}" />
      ${options}
    </form>
  </body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);

  if (url.pathname === '/.well-known/openid-configuration') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
      }),
    );
    return;
  }

  if (url.pathname === '/jwks') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }

  if (url.pathname === '/authorize' && req.method === 'GET') {
    const query = Object.fromEntries(url.searchParams);
    // Scripted/E2E shortcut: pass &as=admin to skip the HTML picker.
    if (query.as && TEST_USERS[query.as]) {
      completeAuthorization(res, query, query.as);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(loginPageHtml(query));
    return;
  }

  if (url.pathname === '/authorize/complete' && req.method === 'POST') {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const query = JSON.parse(decodeURIComponent(params.get('query')));
    const as = params.get('as');
    completeAuthorization(res, query, as);
    return;
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const code = params.get('code');
    const entry = pendingCodes.get(code);
    pendingCodes.delete(code); // single use
    if (!entry || entry.expiresAt < Date.now()) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    const verifierOk = await verifyPkce(params.get('code_verifier') ?? '', entry.codeChallenge);
    if (!verifierOk || params.get('redirect_uri') !== entry.redirectUri) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant', detail: 'PKCE or redirect_uri mismatch' }));
      return;
    }
    const user = TEST_USERS[entry.userKey];
    const idToken = signIdToken({
      clientId: params.get('client_id'),
      sub: user.sub,
      email: user.email,
      name: user.name,
      nonce: entry.nonce,
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id_token: idToken, token_type: 'Bearer', expires_in: 300 }));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

function completeAuthorization(res, query, userKey) {
  const user = TEST_USERS[userKey];
  if (!user) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('unknown test identity');
    return;
  }
  const code = randomUUID();
  pendingCodes.set(code, {
    clientId: query.client_id,
    redirectUri: query.redirect_uri,
    codeChallenge: query.code_challenge,
    nonce: query.nonce,
    userKey,
    expiresAt: Date.now() + 60_000,
  });
  const redirect = new URL(query.redirect_uri);
  redirect.searchParams.set('code', code);
  redirect.searchParams.set('state', query.state);
  res.writeHead(302, { location: redirect.toString() });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

server.listen(PORT, () => {
  console.log(
    JSON.stringify({
      msg: 'fake OIDC IdP listening',
      issuer: ISSUER,
      testUsers: Object.keys(TEST_USERS),
    }),
  );
});
