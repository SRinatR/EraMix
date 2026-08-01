# ADR-0012: TypeScript 7.0.2 everywhere, with a temporary reduced-scope ESLint exception

- Status: Accepted, tracked risk
- Date: 2026-08-01 (revised same day: the initial TS6-shim approach was
  rejected as a policy violation and replaced with the approach below)
- Requirement source: CLAUDE.md "Version baseline — mandatory for bootstrap"
  (`typescript@7.0.2`, real compiler, no shim, anywhere in the repo)

## Context

TypeScript 7.0.2 is the native (Go-based) compiler rewrite. Two Phase 0
tools do not yet support it directly:

1. **typescript-eslint 8.65.0** hard-fails at import time —
   `typescript-eslint does not support TS 7.0` — because it declares a peer
   range of `typescript: >=4.8.4 <6.1.0`. `pnpm.overrides` targeting
   `typescript-eslint>typescript` (and the individual
   `@typescript-eslint/*>typescript` edges) was tried and did not change the
   resolved peer in this pnpm 12 beta.
2. **Next.js 16.2.12**'s production build (`next build`) uses the classic TS
   Program API for its internal type-check pass, which TS 7 does not expose
   the same way: `TypeScript 7.0.2 does not provide the compiler API
required by Next.js.`

An initial fix for (1) aliased the **root** `package.json`'s `typescript`
devDependency to Microsoft's published compatibility package
(`npm:@typescript/typescript6@6.0.2`), so `typescript-eslint`'s peer
resolution would see a `<6.1.0` API. **This was rejected**: the approved
policy is that no project, package, tool, or script — root included — may
resolve `typescript` to anything other than the real `7.0.2` compiler. A
shim satisfying a peer check by presenting a different TypeScript version is
exactly what the policy forbids, even scoped to a directory that never runs
`tsc` itself.

## Decision

- **No shim, anywhere.** Every `package.json` in the repo, including root,
  declares plain `"typescript": "7.0.2"`. `pnpm why typescript -r` resolves
  to exactly one version, `7.0.2`, for all eight workspace projects.
- **TypeScript-aware ESLint integration is disabled** (`typescript-eslint`,
  `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin` are not
  installed anywhere in the tree). `eslint.config.js` globally ignores
  `**/*.ts`, `**/*.tsx`, `**/*.d.ts` — ESLint's default parser cannot parse
  TypeScript syntax at all without that plugin, so attempting to lint `.ts`
  files without it would produce parse errors, not merely skip type-aware
  rules. This is a **temporary, explicitly reduced scope**, not a silent
  gap:
  - ESLint remains mandatory and wired into every package's `lint` script
    and the root `lint` script; it still lints `eslint.config.js` itself and
    any other `.js`/`.mjs`/`.cjs` file that exists or is added. Verified live
    by injecting a deliberately-unused variable into `eslint.config.js` and
    confirming ESLint reports it, then reverting.
  - Because most packages are 100% TypeScript, most `eslint .` invocations
    now match zero files; each package's `lint` script passes
    `--no-error-on-unmatched-pattern` so that's a no-op pass, not a spurious
    failure.
  - `tsc -b` (strict mode, every package, real TS 7) remains the mandatory
    type-safety gate — it was never affected by this issue and still catches
    everything a type-aware ESLint rule would have (unresolvable imports,
    type errors). What is lost is ESLint's _style/pattern_ rules on `.ts`
    files (e.g. `no-unused-vars` phrased as an ESLint rule rather than a
    `tsc` diagnostic) — `tsc -b`'s own `noUnusedLocals`/`noUnusedParameters`
    (already enabled in `tsconfig.base.json`) covers the unused-code case
    specifically.
  - Prettier, `tsc -b`, `vitest run`, `redocly lint`, and `next build` are
    unaffected and remain mandatory exactly as before.
  - **Re-enable trigger**: once `typescript-eslint` (or an equivalent)
    supports `typescript@7.x` (tracked upstream:
    typescript-eslint#10940), remove the `**/*.ts`/`**/*.tsx`/`**/*.d.ts`
    ignores from `eslint.config.js`, reinstall `typescript-eslint`, and
    restore a real TypeScript-aware config (the previous attempt's
    `no-restricted-imports` boundary rule and its per-package
    `eslint.config.js` files are documented in ADR-0001's revision history
    for reference).
- `apps/web/next.config.ts` keeps `experimental.useTypeScriptCli: true`.
  Confirmed this invokes the real compiler: `apps/web`'s own `typescript`
  devDependency is `7.0.2` (never aliased, even before this revision), and
  after removing the root shim entirely, `pnpm why typescript -r` shows a
  single `7.0.2` resolution repo-wide — `next build`'s "Running TypeScript"
  step type-checks with real TS 7, not a shim.

## Consequences

- Module-boundary enforcement (ADR-0001) currently relies solely on
  dependency-graph isolation (`packages/domain`/`packages/application` don't
  declare `next`/`react`/`@prisma/client`/`openid-client` as dependencies, so
  `tsc -b` fails with "Cannot find module" if one is imported) rather than a
  friendly ESLint message. This is still a real, build-breaking check — see
  ADR-0001 for the verification that removes any doubt.
- `frameworkImportPatterns` remains exported from `eslint.config.js` (dead
  code today, intentionally) so the boundary rule can be restored in one
  step once TypeScript-aware linting comes back.
- Anyone adding a `.js`/`.mjs`/`.cjs` file to the repo gets real ESLint
  coverage on it immediately; anyone adding a `.ts` file gets `tsc -b`
  coverage only until the re-enable trigger fires.
