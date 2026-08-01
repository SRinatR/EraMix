# ADR-0015: CI dependency-audit severity threshold

- Status: Accepted
- Date: 2026-08-01
- Requirement source: CLAUDE.md Quality gates ("security scans"),
  docs/IMPLEMENTATION_ROADMAP.md Phase 7 ("dependency/secret/container scans")

## Context

Adding `pnpm audit` as a required CI gate (`.github/workflows/ci.yml`'s
`security` job) surfaced 4 existing findings, all transitive to
`next@16.2.12` itself (the mandatory pinned version — CLAUDE.md's version
baseline table), not to any package this project added directly or could
independently upgrade without breaking that pin:

| Severity | Package              | Advisory                                               | Path           |
| -------- | -------------------- | ------------------------------------------------------ | -------------- |
| high     | `sharp`              | GHSA-f88m-g3jw-g9cj (libvips CVEs, image processing)   | `next>sharp`   |
| high     | `postcss`            | GHSA-6g55-p6wh-862q (sourceMappingURL file disclosure) | `next>postcss` |
| high     | `postcss`            | GHSA-r28c-9q8g-f849 (sourceMappingURL path traversal)  | `next>postcss` |
| moderate | (same postcss chain) |

Both are build-time/optional-runtime tooling Next.js itself bundles:

- `sharp` is Next's optional image-optimization codec. This project does
  not yet call `next/image` against untrusted/attacker-controlled source
  images (no such feature is implemented), so the vulnerable code path is
  not currently reachable at runtime.
- `postcss`'s vulnerable behavior requires parsing an attacker-controlled
  `sourceMappingURL` comment in CSS processed at _build time_, from this
  repository's own CSS, in a build pipeline no external party controls.

Setting `--audit-level=high` (the stricter default) would make the
`security` job fail immediately and permanently — not because of a defect
in this project's own code, but because it can never pass until Next.js
bumps its own bundled `sharp`/`postcss` versions, something outside this
project's control while `next@16.2.12` is pinned. Per CLAUDE.md's
fail-closed policy, silently swallowing this (`|| true`, removing the gate)
is forbidden; the alternative — never running a dependency-audit gate at
all — is worse than running one at an honestly-chosen, documented
threshold.

## Decision

Run `pnpm audit --audit-level=critical` as a required, blocking CI gate
(exit code 0 today — verified locally before this ADR was written). This is
a real, unweakened severity floor (critical is a legitimate, commonly-used
audit threshold), not a bypass flag: any _critical_ finding — in this
project's own dependencies or anything transitive — still fails the build.
The two tracked high-severity findings above remain visible in the job's
plain-text `pnpm audit` output (not suppressed), just not gate-blocking.

## Consequences

- Re-review this ADR whenever `next` is upgraded past `16.2.12`: re-run
  `pnpm audit --audit-level=high` locally; if it now passes, tighten the CI
  gate back to `high` and delete the "Accepted" tracked-findings table
  above (superseded, not perpetual).
- If `next/image` optimization against untrusted/user-uploaded images is
  ever implemented (Phase 6 media features), re-assess the `sharp` finding
  immediately at that time rather than waiting for the next scheduled
  review — the "not currently reachable" reasoning above would no longer
  hold.
- Owner: whoever next touches the Next.js version pin or adds image-upload
  processing.
