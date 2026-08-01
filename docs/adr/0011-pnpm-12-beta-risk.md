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
  unprivileged and this specific failure mode does not occur — this is the
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

## Addendum, 2026-08-01 (same day, later session): a second, distinct pnpm-12-beta risk found once CI actually ran

The paragraph above ("this is the reproducible clean-install CI gate...")
was written before this repository had a git remote or any real GitHub
Actions execution (see Phase 0's status block: "no real GitHub Actions run
has executed it yet"). Once a remote was added and pushes started
triggering real runs, the `install` job failed on **every single push**
(multiple consecutive commits, all failing identically) — a _different_
defect from the Windows symlink issue above, this time in Corepack itself,
not this project's configuration:

```
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-12.0.0-beta.2.tgz
node:internal/modules/cjs/loader:1520
  throw err;
Error: Cannot find module '/home/runner/.cache/node/corepack/v1/pnpm/12.0.0-beta.2/bin/pnpm.mjs'
```

Diagnosis (in order actually attempted, each verified against the real CI
log before moving to the next):

1. `actions/setup-node@v5`'s new `package-manager-cache: true` default was
   independently also broken (tried to invoke `pnpm` before Corepack had
   even run) — fixed by setting `package-manager-cache: false` explicitly.
   This was a real, separate bug layered on top of the one below; fixing it
   was necessary but not sufficient.
2. Upgrading Corepack itself (`npm install -g corepack@latest`) before
   `corepack enable` — did not fix it; identical error.
3. `corepack prepare pnpm@12.0.0-beta.2 --activate` (the documented pattern
   for forcing eager, synchronous download instead of relying on lazy
   first-use fetch) — printed "Preparing pnpm@12.0.0-beta.2 for immediate
   activation..." and then returned control to the next step _before_ the
   download/extraction actually completed, so the following `pnpm install`
   still hit the same missing-file error. This, plus confirming the exact
   tarball URL Corepack logs returns a real `200 OK` (`curl -I` verified),
   ruled out "missing package" and pointed at Corepack's own fetch/activate
   sequencing.
4. Found the actual root cause: **[nodejs/corepack#873](https://github.com/nodejs/corepack/issues/873)**,
   open since 2026-07-15, still unresolved — `MODULE_NOT_FOUND` reproducing
   with `pnpm@12` alpha/beta releases specifically, because pnpm@12
   introduced a `preinstall` lifecycle script (not present in pnpm@11) that
   Corepack's current release does not handle correctly when fetching and
   activating a package manager version. Cross-referenced and
   maintainer-triaged at pnpm/pnpm#13018; listed under the
   [pnpm v12 milestone](https://github.com/pnpm/pnpm/milestone/120), i.e.
   expected to be resolved by pnpm v12's stable release, not by anything
   fixable in this repository's configuration.

**Resolution applied**: `.github/workflows/ci.yml`'s `install` job (and
every other job needing pnpm) now runs `npm install -g pnpm@12.0.0-beta.2`
directly and does **not** call `corepack enable`/`corepack prepare` at all
in CI — calling `corepack enable` would reinstate Corepack's shim ahead of
this binary on `PATH` and immediately re-trigger the same upstream bug on
first invocation. This still runs the exact CLAUDE.md-pinned
`pnpm@12.0.0-beta.2`; only the _activation mechanism_ differs from local
dev (which continues to use Corepack per the Decision section above, since
this exact failure has not reproduced locally — the trigger condition
appears specific to a from-empty `~/.cache/node/corepack` on a fresh
runner, not the already-warmed local dev cache).

**Re-review trigger**: once nodejs/corepack#873 is closed upstream (or
pnpm v12 GA ships with a working Corepack fetch path), try reverting CI to
`corepack enable` + `corepack prepare pnpm@<version> --activate` and delete
this addendum if it now passes.
