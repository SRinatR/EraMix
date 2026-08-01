# ADR-0011: pnpm 12.0.0-beta.2 as the pinned package manager (tracked risk)

- Status: Accepted, tracked risk
- Date: 2026-08-01
- Requirement source: CLAUDE.md "Version baseline — mandatory for bootstrap"
  (`pnpm@12.0.0-beta.2` via Corepack, "treated as a tracked delivery risk with
  a reproducible clean-install CI gate")

## Context

CLAUDE.md pins `pnpm@12.0.0-beta.2` (the Rust rewrite, `next-12` dist-tag —
not yet `latest`) rather than the current stable `pnpm@11.18.0`. During Phase
0 bootstrap this produced a real, reproducible failure on Windows:

```
Failed to create symlink at "...\node_modules/.pnpm\@vitest+mocker@4.1.10_vite@8.2.0\node_modules\@vitest/spy"
to "...\node_modules/.pnpm\@vitest+spy@4.1.10\node_modules\@vitest/spy":
A required privilege is not held by the client. (os error 1314)
```

Root cause: pnpm 12 beta's virtual store requires real NTFS symlink
privilege even with `node-linker=hoisted` (older pnpm's junction-point
fallback for directory links on Windows was not effective here). Windows
Developer Mode was not enabled and the running user did not hold
`SeCreateSymbolicLinkPrivilege`; the sandboxed session could not grant either
(a `HKLM` registry write to enable Developer Mode was denied). Install only
succeeded after Developer Mode was enabled out-of-band by the user.

`pnpm-workspace.yaml`'s `allowBuilds` gate (new in pnpm 12) also required an
explicit decision for `sharp`'s native build script (Next.js's image
optimization dependency); approved as `true` — a well-known, widely-audited
native package, and required for `next build`/`next/image` to function.

## Decision

Keep the `pnpm@12.0.0-beta.2` pin as CLAUDE.md requires, with these
mitigations recorded rather than silently worked around:

- **Local dev on Windows requires Developer Mode enabled**
  (Settings → Privacy & security → For developers → Developer Mode), or
  running the shell elevated. This is now a documented prerequisite, not an
  assumption.
- `.npmrc` does **not** set `node-linker=hoisted` — the default `isolated`
  linker is used, since hoisting did not actually avoid the symlink
  requirement in this beta and would have weakened dependency isolation for
  no benefit.
- CI (`.github/workflows/ci.yml`, `install` job) runs `pnpm install
--frozen-lockfile` on `ubuntu-latest`, where symlink creation is
  unprivileged and this failure mode does not occur — this is the
  "reproducible clean-install CI gate" CLAUDE.md requires for the beta risk.
- `pnpm-workspace.yaml`'s `allowBuilds: { sharp: true }` is committed
  explicitly rather than left for each developer to answer interactively.

## Consequences

- Any new Windows contributor/CI runner must enable Developer Mode before
  `pnpm install` will succeed; this should be called out in onboarding docs
  when they're written.
- If pnpm 12 reaches a stable GA release before Phase 7 (infra/CI/CD), the
  pin should be bumped to the stable release and this ADR's risk section
  marked resolved.
- If this symlink requirement turns out to also affect a CI runner image (not
  observed yet — only reproduced locally on Windows), the mitigation is the
  same: enable the equivalent of Developer Mode on that image, not a switch
  to `hoisted` (which did not fix it here) and not a silent downgrade of the
  pin without the Product Owner sign-off CLAUDE.md requires for that change.
