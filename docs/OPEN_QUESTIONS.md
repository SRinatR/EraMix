# Open questions blocking later phases

Source: TZ v1.1 §21 ("Риски, зависимости и открытые решения"), Q-01..Q-08.
None of these block Phase 0 (repository bootstrap). Each is restated here in
English with the phase it blocks and the ADR it will resolve into, so it is
not lost between sessions. Do not invent an answer to any of these — they
require a business/Product Owner/Architecture decision per CLAUDE.md's change
management rule.

| ID   | Question / risk                                                                                                                                 | Blocks                                                                           | Resolves into                                                                                      | Owner (per TZ)     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------ |
| Q-01 | ODS issuer, endpoints, scopes, claims, and a test tenant have not been provided.                                                                | Phase 4 (Identity)                                                               | ADR-0003                                                                                           | Product + Security |
| Q-02 | MVP locales and URL policy are fixed (`ru`, `tt`, `en`, `uz` — see ADR-0010), but a translation-content fill plan/owners/deadlines are not set. | Phase 2/3 content rollout                                                        | — (not an ADR; a content plan)                                                                     | Product + Content  |
| Q-03 | Pricing model is undecided: quote-only vs. price snapshot on `OrderLine`.                                                                       | Phase 5 (Ordering)                                                               | ADR-0005                                                                                           | Sales + Product    |
| Q-04 | No 12-month load/catalog-size forecast exists.                                                                                                  | SLO/index sizing validation before Phase 7 staging                               | — (informs ADR-0008/0009, not its own ADR)                                                         | Business           |
| Q-05 | Legal/privacy data retention has not been approved.                                                                                             | DB-006 (personal-data deletion/anonymization use case), Phase 6/7                | — (compliance sign-off, not an ADR)                                                                | Legal              |
| Q-06 | Hosting, email provider, and object storage have not been chosen.                                                                               | Phase 6 (media/object storage), Phase 5 (notifications/email), Phase 7 (hosting) | ADR-0006 (object storage), ADR-0007 (email), ADR-0008 (hosting/PITR)                               | Architecture       |
| Q-07 | OpenAPI 3.2 tool support was uncertain.                                                                                                         | Phase 0 (Contracts)                                                              | **Resolved** — see ADR-0004: `@redocly/cli@2.43.2` lints 3.2.0 directly; no 3.1.x fallback needed. | —                  |
| Q-08 | OAuth 2.1 is still an Internet-Draft, not a final RFC.                                                                                          | Phase 4 (Identity)                                                               | Folds into ADR-0003; use RFC 9700 + OIDC Core now, re-review if/when OAuth 2.1 publishes.          | Security           |

## Phase 0 tooling risks (not in the original TZ, discovered during bootstrap)

These are recorded as ADRs, not here, since they are resolved engineering
decisions rather than open business questions — see:

- ADR-0011 — `pnpm@12.0.0-beta.2` Windows symlink-privilege requirement
  (Developer Mode now required for local installs).
- ADR-0012 — `typescript@7.0.2` compatibility shim for `typescript-eslint`
  and Next.js's build-time type checker.
