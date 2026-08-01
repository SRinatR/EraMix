# ADR-0003: ODS Identity claim mapping and session strategy

- Status: Blocked — pending Q-01
- Date: 2026-08-01
- Requirement source: TZ v1.1 §9.2, Appendix D (ADR-003, "Блокирующий"), §21
  Q-01, Q-08

## Context

Phase 4 requires OIDC Authorization Code + PKCE against ODS Identity, with a
stable user mapping by `(issuer, subject)` and a defined claim-to-role
mapping. TZ §21 Q-01 states the ODS issuer, endpoints, scopes, claims, and a
test tenant have not been provided. This cannot be decided from the TZ text
alone.

## Decision

Not made. Blocked pending:

- ODS issuer URL, authorization/token/JWKS endpoints, and a test tenant
  (Q-01).
- Confirmed claim names for identity, role/permission, and company
  membership.
- Final security profile note: RFC 9700 + OIDC Core is the baseline; OAuth
  2.1 is still a draft (Q-08) and will be reviewed if/when it publishes.

## Consequences

Phase 4 must not begin implementation against invented/guessed ODS values.
When the integration pack arrives, replace this ADR's status with Accepted
and fill in the actual contract before writing any OIDC code.
