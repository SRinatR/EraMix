# ADR-0004: OpenAPI 3.2 toolchain

- Status: Accepted
- Date: 2026-08-01
- Requirement source: TZ v1.1 §8, API-009, Appendix D (ADR-004, "Блокирующий"),
  §21 Q-07

## Context

TZ §12 and API-009 mandate OpenAPI 3.2.0 as the contract source of truth, with
a generated 3.1.x compatibility artifact permitted only through an ADR if a
tool cannot yet consume 3.2 (§21 Q-07 flags this as a known risk: "OpenAPI 3.2
поддерживается не всеми инструментами"). This ADR records the toolchain
selected for Phase 0 and confirms empirically whether the compatibility
fallback is needed yet.

## Decision

- Source document: `packages/contracts/openapi/openapi.yaml`, `openapi: 3.2.0`.
- Lint/validate: `@redocly/cli` (`redocly lint`), configured per-package via
  `packages/contracts/redocly.yaml`, run as part of `packages/contracts`'s
  `lint` script and therefore the root CI `source` gate.
- Empirical result: `@redocly/cli@2.43.2` parses and lints an
  `openapi: 3.2.0` document without errors or fallback. **No 3.1.x
  compatibility artifact is needed at this time.** If a future tool in the
  pipeline (client codegen, another linter) cannot consume 3.2, that
  specific tool's fallback must be scoped narrowly (generated artifact only,
  never a hand-maintained second source) and recorded as an amendment here,
  per API-009.
- Client/type generation and contract-diff tooling are deferred to the phase
  that first needs them (Catalog read endpoints, Phase 3) rather than
  speculatively chosen now.

## Consequences

- `packages/contracts` is the only place OpenAPI tooling versions are pinned;
  bumping `@redocly/cli` follows the same "latest stable after CI" policy as
  other independently-released tooling (TZ Appendix E).
- Two Redocly rules are deliberately disabled with recorded rationale in
  `packages/contracts/redocly.yaml` (`info-license-strict` — internal
  proprietary API, no public license URL; `operation-4xx-response` — the
  liveness/readiness probes have no 4xx case, and fabricating one would
  misrepresent the contract). Any future rule suppression in that file must
  carry the same kind of one-line justification.
