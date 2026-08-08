# ADR-0003: ODS Identity claim mapping and session strategy

- Status: Partially Accepted — real issuer/endpoints supplied 2026-08-08;
  client registration still pending
- Date: 2026-08-01 (issuer contract recorded 2026-08-08, production
  deployment session)
- Requirement source: TZ v1.1 §9.2, Appendix D (ADR-003, "Блокирующий"), §21
  Q-01, Q-08

## Context

Phase 4 requires OIDC Authorization Code + PKCE against ODS Identity, with a
stable user mapping by `(issuer, subject)` and a defined claim-to-role
mapping. TZ §21 Q-01 states the ODS issuer, endpoints, scopes, claims, and a
test tenant have not been provided. This cannot be decided from the TZ text
alone.

## Decision

**Q-01 issuer/endpoints (Accepted, 2026-08-08)**: the Product Owner's real
ODS partner organization (`eramix.ods.uz`, org code `eramix`) supplied the
real, non-invented OIDC contract:

- Issuer: `https://auth.ods.uz`
- Discovery: `https://auth.ods.uz/.well-known/openid-configuration`
- Authorize: `https://auth.ods.uz/authorize`
- Token: `https://auth.ods.uz/token`
- UserInfo: `https://auth.ods.uz/userinfo`
- JWKS: `https://auth.ods.uz/.well-known/jwks.json`
- Logout (RP-initiated): `https://auth.ods.uz/connect/logout`

An SSO application (`EraMix Web`) is being registered in the ODS partner
console against these values: confidential client, `client_secret_post`
token-endpoint auth (matches
`packages/infrastructure/src/oidc/oidc-identity-provider.ts`'s POST-body
`client_secret`), PKCE S256 (mandatory in ODS, matches this codebase's
existing generic OIDC adapter unchanged), callback
`https://eramix.uz/api/auth/callback`, post-logout
`https://eramix.uz`, scopes `openid email profile` (matches
`oidc-identity-provider.ts`'s hardcoded authorization-request scope — no
code change needed for login/claims). `client_id`/`client_secret` are
supplied at deploy time via `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` (never
committed) once the application is created.

**Role/company-membership claim mapping: still open, but lower-risk than
originally scoped.** ODS's own console exposes `organization_role`, `roles`,
and `permissions` claims, but those describe the caller's role _within the
ODS partner organization_, not an EraMix `PlatformRole` — ADR-0014 already
decided every first login creates a `CUSTOMER` regardless of any ODS claim,
with role promotion handled entirely inside EraMix's own admin UI/DB, never
derived from an ODS claim. This ADR does not need to map ODS role claims to
`PlatformRole` at all; only `sub` (subject), `email`, and `name`/`profile`
claims are consumed, exactly as `oidc-identity-provider.ts` already does.

**Final security profile**: RFC 9700 + OIDC Core remains the baseline; OAuth
2.1 is still a draft (Q-08) and will be reviewed if/when it publishes.

## Consequences

Real login against ODS can now be exercised once the SSO application exists
and its `client_id`/`client_secret` are set in the production environment.
No OIDC code changes were required — the existing generic
`OidcIdentityProvider` adapter (built before Q-01 resolved, deliberately
against no invented ODS specifics) works unmodified against the real issuer.
The negative-path tests this ADR's own Phase 4 exit criteria name (JWKS
rotation, expired token, unknown claims) are still only proven against the
fake IdP double (`scripts/pi/oidc-fake-idp.mjs`) and must be re-verified
against the real ODS issuer during the first production smoke test.
