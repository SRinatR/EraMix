# ADR-0016: dotenvx as the standard developer/CI environment-file workflow

- Status: Accepted
- Date: 2026-08-02
- Requirement source: controlled dotenvx migration task (Product Owner
  request); CLAUDE.md "Fail-closed delivery policy", "Security and identity",
  and "Quality gates" sections

## Context

`dotenv@17.4.2` was a direct devDependency of `apps/web` and
`packages/infrastructure`, imported **programmatically** in four places —
`apps/web/next.config.ts`, `packages/infrastructure/prisma.config.ts`,
`packages/infrastructure/prisma/seed.ts`, and
`packages/infrastructure/prisma/seed-e2e.ts` — each independently calling
`loadDotenv({ path: '<repo-root>/.env' })` before anything else ran. This
worked, but:

- it duplicated the same "find the repo-root `.env`" logic in four unrelated
  files instead of one place;
- it silently ran for every invocation of `next`/`prisma`/`tsx`, including
  ones (`next build`, `prisma generate`, `prisma migrate deploy`) that CI and
  the Docker build stage already supply via ambient `env:`/`ENV`/
  `environment:` values and never needed a `.env` file for;
- it gave the repository no encrypted-secret story at all if one is ever
  wanted (a plaintext `.env` is the only thing `dotenv` understands);
- it gave no single CI gate proving `.env.example` stays complete and
  schema-valid as `packages/infrastructure/src/env.ts`'s zod schema evolves.

None of this was a security defect — `.env` was already correctly
gitignored, `packages/infrastructure/src/env.ts`'s `loadEnv` already fails
closed on missing/invalid required values, and CI/Docker/the Pi scripts
already source real values from ambient `env:`/`environment:`/`export`, never
a committed file. This ADR replaces the ad hoc `dotenv` imports with
`dotenvx` used **only** as a CLI launcher in `package.json` scripts, changing
none of those existing guarantees.

## Decision

### Package, version, and integrity

- Package: `@dotenvx/dotenvx` (npm-official, `https://github.com/dotenvx/dotenvx`).
- Version: `2.19.1` — the `latest` dist-tag on the npm registry at the time
  of this ADR (`npm view @dotenvx/dotenvx dist-tags` → `{"latest":"2.19.1"}`),
  exact-pinned (`.npmrc`'s `save-exact=true`) rather than a floating range.
- Integrity, as recorded in `pnpm-lock.yaml`:
  `sha512-OTTjLHzAm2/V7OwshVBfwe9YPKpRaeuGYS6Tq3TLu5dugmvuqtVWP4FOWud2KEnbTY8FNY6Wb4gMyDNUwfU1Uw==`
  (verified by `pnpm install --frozen-lockfile`'s supply-chain checks on every
  install, same as every other pinned dependency in this repository).
- Installed as a **single root-level devDependency** (`pnpm add -D -w`), not
  duplicated per-package. Verified directly (not assumed) that pnpm's
  isolated linker still resolves the root-hoisted `dotenvx` binary from a
  `pnpm run <script>` invoked inside any workspace subpackage — confirmed
  with a throwaway probe script run via `pnpm --filter @eramix/web run
<probe>` before relying on it, then removed. `pnpm exec dotenvx` and a bare
  `dotenvx` inside a `package.json` script both resolve correctly from
  `apps/web`, `apps/worker`, and `packages/infrastructure`.
- Own dependency tree is minimal and has no `postinstall`/lifecycle script
  (`yocto-spinner`, `@dotenvx/tooling`, `@dotenvx/primitives` — all inspected
  in `node_modules` before relying on the package; none register a build
  script, so `pnpm-workspace.yaml`'s `allowBuilds` gate needed no new entry).
- Installed exclusively via `pnpm add -D -w @dotenvx/dotenvx@2.19.1` from the
  npm registry — no curl-pipe install, no global npm/winget/choco install, no
  Docker-based install.

### Its role: launch-time CLI wrapper only, never a programmatic import

`dotenvx` is used **exclusively** as a CLI (`dotenvx run -f <path> --
<command>`) inside `package.json` `scripts` blocks. Nothing in
`packages/domain`, `packages/application`, `packages/ui`, or any route/UI
code imports `dotenv` or `@dotenvx/dotenvx`. The four files that used to call
`dotenv`'s `config()` programmatically had that call deleted outright, not
replaced with an equivalent `dotenvx` call — by the time those modules
(`next.config.ts`, `prisma.config.ts`, the seed scripts) execute, the
process's env is already populated by the `dotenvx run` wrapper that launched
them (or, in CI/Docker/the Pi scripts, by the ambient env those environments
already set directly).

`packages/infrastructure/src/env.ts`'s `loadEnv`/zod schema is unchanged and
remains the only thing the application itself trusts — it still reads
`process.env` exclusively and still throws a fail-closed error on missing or
invalid required configuration, independent of whatever put values into
`process.env` in the first place.

Wrapped scripts (all read the monorepo-root `.env` via a relative
`-f ../../.env` path, and pass `--ignore MISSING_ENV_FILE` so a missing
`.env` file — the normal case in CI, Docker, and the Pi scripts, none of
which use one — produces no output and exit code 0, never a false-alarm
failure):

| Package                   | Script              | Command                                                                    |
| ------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `apps/web`                | `dev`               | `dotenvx run -f ../../.env --ignore MISSING_ENV_FILE -- next dev`          |
| `apps/web`                | `start`             | `dotenvx run -f ../../.env --ignore MISSING_ENV_FILE -- next start`        |
| `apps/worker`             | `start`             | `dotenvx run -f ../../.env --ignore MISSING_ENV_FILE -- node dist/main.js` |
| `packages/infrastructure` | `db:validate`       | `dotenvx run … -- prisma validate`                                         |
| `packages/infrastructure` | `db:generate`       | `dotenvx run … -- prisma generate`                                         |
| `packages/infrastructure` | `db:migrate:dev`    | `dotenvx run … -- prisma migrate dev`                                      |
| `packages/infrastructure` | `db:migrate:deploy` | `dotenvx run … -- prisma migrate deploy`                                   |
| `packages/infrastructure` | `db:seed`           | `dotenvx run … -- tsx prisma/seed.ts`                                      |
| `packages/infrastructure` | `db:seed:e2e`       | `dotenvx run … -- tsx prisma/seed-e2e.ts`                                  |
| `packages/infrastructure` | `test:integration`  | `dotenvx run … -- vitest run --config vitest.integration.config.ts`        |

`apps/web`'s `build`/`typecheck`/`test`/`lint` and `apps/worker`'s
`build`/`typecheck`/`test`/`lint` are **not** wrapped — verified none of them
read `DATABASE_URL`/secrets at module-load or build time (`next build` never
constructs the request-scoped composition root in
`apps/web/src/server/container.ts`, which is where `loadEnv()` actually
runs), so wrapping them would be a wrapper with no purpose. `dotenvx run`
with `--overload` is never used anywhere — verified default behaviour keeps
existing `process.env` values taking precedence over `.env` file contents,
which is exactly what lets the same wrapped scripts run unchanged whether a
developer's shell already exports `DATABASE_URL` (the Pi scripts' pattern —
`scripts/pi/*.sh` `export DATABASE_URL=…` before calling these same script
names) or relies entirely on the `.env` file.

### Why the production secret store remains authoritative

`dotenvx` never runs in a context that reaches a production/staging secret.
Verified for each:

- **CI** (`.github/workflows/ci.yml`): every job sets `DATABASE_URL` (and, in
  `db-migration`, the real Postgres 19 Beta 2 service credentials) via
  workflow/job-level `env:` blocks — GitHub Actions' own secret/env
  mechanism, never a `.env` file (none is checked out; `.gitignore` still
  excludes it). The two new `dotenvx precommit`/`prebuild` CI steps (see
  below) don't change this — they only ever _check for the absence_ of a
  committable secret file.
- **Docker** (`infra/docker/web.Dockerfile`, `worker.Dockerfile`): the build
  stage's `DATABASE_URL` is a documented, non-secret placeholder (`ENV
DATABASE_URL=postgresql://build:build@…`) needed only because
  `prisma.config.ts`'s `env('DATABASE_URL')` throws if the variable is
  entirely unresolvable — `prisma generate` never actually connects. The
  runtime stage runs `CMD ["node", …]` directly, bypassing `package.json`
  `scripts` (and therefore `dotenvx`) entirely; real values are injected as
  container env vars by whatever starts the container
  (`infra/docker/docker-compose.yml`'s `environment:` blocks locally — all
  documented throwaway local-dev credentials, matching `.env.example`'s own
  comment — the real deployment secret store once this goes to
  staging/production).
- **The Pi scripts** (`scripts/pi/*.sh`): `export DATABASE_URL=…` directly in
  the shell before calling any wrapped script; `dotenvx`'s
  existing-env-takes-precedence default means the wrapper is a no-op here.

`dotenvx` therefore never becomes a second source of truth for a real
secret — it only ever smooths over the **local, unattended-shell** case
where nothing has already exported a value.

### Key ownership, rotation, and revocation (future encrypted-env workflow)

No `.env` file is encrypted today, and this task deliberately does not
create one — no real secret exists to encrypt, and generating a fake one
that could later be mistaken for a real credential is explicitly out of
scope. The workflow below is **documented but not yet exercised**; it
becomes available the moment a Product Owner/security decision opts in:

1. A Product Owner/security decision authorizes encrypting a specific
   `.env.<environment>` file (e.g. `.env.production`). Until that decision is
   recorded (as an amendment to this ADR or its own follow-up ADR), no
   encrypted environment file is committed.
2. `dotenvx encrypt -f .env.<environment>` produces a committable, encrypted
   `.env.<environment>` (ciphertext values, safe to read in a PR diff) and a
   `.env.keys` file holding the matching private decryption key.
3. `.env.keys` (and any `.env.*.keys` variant) is **never** committed —
   already enforced today, before any encrypted file exists, by:
   - `.gitignore`'s explicit `.env.keys`/`.env.*.keys` lines (on top of the
     pre-existing `.env.*` pattern — belt-and-braces, so a future edit to the
     broader pattern can't silently stop covering it);
   - `.dockerignore`'s identical exclusions, so it can never enter a Docker
     build context or image layer even transiently;
   - the CI `security` job's `dotenvx precommit`/`dotenvx prebuild` gates
     (fail-closed: either command `throw`s and exits non-zero the moment any
     `.env*`-pattern file on disk is neither gitignored/dockerignored, the
     literal `.env.example`, nor dotenvx-encrypted ciphertext).
4. The matching private key is stored **only** in the approved CI/VPS secret
   store (e.g. a GitHub Actions secret, or the VPS's own secret manager) —
   never printed, logged, copied into a container image, or held only on one
   person's laptop. Rotation = generate a new keypair
   (`dotenvx keypair`/`dotenvx encrypt` again), re-encrypt, update the secret
   store's copy, revoke the old key from the secret store. Revocation without
   rotation (an emergency stop) = delete the key from the secret store; the
   encrypted `.env.<environment>` becomes unreadable until a new key is
   provisioned, which is the intended fail-closed behaviour for a suspected
   key leak.
5. Production private keys are injected into the running process by the
   deployment secret store at container/process start — never baked into an
   image layer, never committed alongside the ciphertext they decrypt.

### Environment matrix (as implemented today)

| Environment               | Source of real values                                                                                                                                                                                                                | `.env` file involved?                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Local development         | `.env` (copied from `.env.example`, gitignored)                                                                                                                                                                                      | Yes — read by the `dotenvx`-wrapped scripts above                       |
| Local unit/contract tests | Explicit values passed to `loadEnv(source)` in test code, or none needed                                                                                                                                                             | No                                                                      |
| CI (GitHub Actions)       | Workflow/job-level `env:` blocks, `postgres:19beta2-alpine` service credentials                                                                                                                                                      | No                                                                      |
| Pi demo/staging session   | `scripts/pi/*.sh` `export`ed shell variables                                                                                                                                                                                         | No (dotenvx wrapper present but a no-op — existing env wins)            |
| Production (future)       | Deployment platform's secret store, injected as container env vars at start; optionally an encrypted `.env.production` decrypted in-process via a securely-stored `.env.production.keys` (see "future encrypted-env workflow" above) | Only if/when the encrypted-file workflow above is explicitly opted into |

### CI/tooling gates added

- `packages/infrastructure/src/env-example.test.ts` (runs as part of the
  existing `unit` job's `pnpm run test` — no new CI job needed): parses the
  committed `.env.example` with Node's built-in `util.parseEnv` (stable since
  Node 20.12 — deliberately not `dotenvx`/`dotenv` here, since this is test
  code, not a launch-time script) and asserts it resolves against
  `loadEnv`'s zod schema without throwing, and that no
  `SESSION_SECRET`/`MEDIA_SIGNING_SECRET`/`OIDC_CLIENT_SECRET` value is
  present (those must stay commented/unset — documentation, never a live
  credential).
- `packages/infrastructure/src/env.test.ts` gained two redaction regression
  tests: an invalid `SESSION_SECRET` and a `DATABASE_URL` with real-looking
  credentials both trigger `loadEnv`'s fail-closed throw without either
  secret value appearing anywhere in the thrown `Error.message` — verified
  against zod v4's actual `safeParse` error shape (path/code/message only,
  no echoed input) before writing the assertion, not assumed.
- `.github/workflows/ci.yml`'s `security` job gained two steps:
  `pnpm exec dotenvx precommit` and `pnpm exec dotenvx prebuild` — both
  fail-closed (non-zero exit) the moment any `.env*`-pattern file on disk is
  trackable/dockerable without being gitignored/dockerignored, `.env.example`
  itself, or dotenvx-encrypted ciphertext. Exercised locally against a
  previously-missing `.dockerignore` before writing one (`dotenvx prebuild`
  correctly failed with `.env not encrypted/dockerignored`) and again after
  (`▣ encrypted/dockerignored (2)`), so this gate is proven to actually catch
  the gap it exists for, not just proven to pass.
- `pnpm audit --audit-level=critical` and the existing `gitleaks` secret scan
  are unchanged and remain mandatory — `dotenvx` supplements, never replaces,
  either.

### Non-essential output disabled

`dotenvx run`'s source (`src/cli/actions/run.js`, inspected directly) makes
no network call and has no "checkpoint"/update-tip system in this version —
confirmed by reading the actual `run` command path, not assumed from older
`dotenvx` release notes. The one informational line it does print
(`⟐ injected env (N) from <path>` — a count and file path only, never a
value) is left at its default visibility rather than forced to `--quiet`,
since it is the one piece of positive confirmation a developer gets that
their `.env` was actually read; `--quiet` remains available per-invocation
(`-q`) if a developer wants it suppressed.

## Consequences

- Local developer setup is unchanged in substance: copy `.env.example` to
  `.env`, fill in real values, run `pnpm --filter web run dev` (etc.) as
  before — the only difference is that loading now happens once, in one
  wrapper pattern, instead of once per config file via a programmatic
  import.
- `dotenv@17.4.2` remains present in `pnpm-lock.yaml` **only** as a
  transitive dependency of `prisma`'s own `c12` config-file loader — not a
  direct dependency of this repository, not imported by any of our code, and
  out of scope to remove (CLAUDE.md: "do not alter unrelated dependencies").
- If `nodejs/corepack#873` (ADR-0011) or any other pnpm-12-beta issue ever
  forces a package-manager change, `@dotenvx/dotenvx`'s pin and lockfile
  integrity travel with the rest of the dependency graph — no special
  handling needed.
- **Rollback plan**, if `dotenvx` ever needs to be backed out: remove the
  `dotenvx run -f … --` prefix from the ten wrapped scripts above (reverting
  to the plain `next dev`/`prisma generate`/etc. commands they wrap),
  restore the four deleted programmatic `dotenv.config()` calls (or leave
  local dev relying on the developer's shell already exporting the required
  variables, which every non-local environment already does), and remove the
  `@dotenvx/dotenvx` devDependency and the two CI gate steps. Nothing in
  production, CI secret handling, or the application's own `loadEnv`
  contract depends on `dotenvx` existing, so this rollback is a pure
  dev-tooling revert with no data or deployment impact.
- The encrypted-`.env` workflow documented above remains unimplemented until
  a Product Owner/security decision opts in; until then, `.env.keys` must
  never appear in this repository, and the CI gates above enforce that
  automatically rather than relying on review discipline alone.
