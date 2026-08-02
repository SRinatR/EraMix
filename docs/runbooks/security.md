# Runbook: upload/media security posture

> This runbook also covers environment/secret handling — see "Environment
> configuration and secrets" below — despite its upload-focused title; it is
> the repository's one security runbook.

Status: describes the MVP implementation as it exists today (generic media
uploads, `packages/application/src/uploads.ts`; product image/document
attachments, `packages/application/src/product-assets.ts`). The concrete
object-storage provider and malware scanner are both **blocked on
Q-06/ADR-0006** — everything below runs against the documented dev-only
stand-ins (`LocalFilesystemStorageProvider`, `DevMalwareScanner`) and must be
re-verified against the real providers once ADR-0006 resolves.

## Upload pipeline (never skipped, never reordered)

1. **Allowlist validation** (`packages/domain/src/upload-validation.ts`):
   MIME type against `ALLOWED_UPLOAD_TYPES` (jpeg/png/webp/pdf only),
   extension must agree with the declared MIME type, size within
   `MAX_UPLOAD_SIZE_BYTES` (10 MB), and a magic-byte signature check so a
   renamed executable with a spoofed `Content-Type` is rejected even though
   its filename/header both lie.
2. **Malware scan** (`MalwareScanner` port) — a file that fails validation
   never reaches the scanner; a file that fails the scan never reaches
   storage or gets a database row.
3. **Storage** — the binary is written under a server-generated key
   (`sanitizeFilenameForStorage`, `packages/domain/src/filename.ts`) that
   never re-uses the caller-supplied filename or path. Product assets use
   `storageKey = product-assets/<generated-id>-<sanitized-filename>`.

## Malware-scan honesty

`ProductAsset.malwareScanEngine` (and, going forward, any other scanned
asset type) always records which scanner actually ran — currently
`"dev-stub (EICAR-only detection, not production-grade — ADR-0006 pending)"`
(`apps/web/src/server/container.ts`'s `malwareScanEngineName`). Nothing in
the admin UI, API response, or audit trail is allowed to imply a
production-grade antivirus clearance while this string says otherwise. When
a real scanner is wired, update this one constant — every existing/future
`ProductAsset` row keeps its own historically-accurate value; do not
backfill old rows to claim a scan they never received.

`MalwareScanStatus` only ever persists as `CLEAN` in the MVP: an `INFECTED`
result throws before a row is created (see the pipeline above), so a
"clean" row genuinely passed the currently-configured scanner — it is
`malwareScanEngine` that tells you how much that is actually worth.

## Storage-key and path-traversal safety

- `sanitizeFilenameForStorage` replaces every character outside
  `[a-zA-Z0-9._-]` with `_`, which neutralizes `/`, `\`, and `..` segments
  without needing a separate traversal denylist (covered by
  `packages/domain/src/filename.test.ts`).
- `LocalFilesystemStorageProvider` always joins the sanitized key onto its
  configured base directory (`path.join(baseDir, key)`); a key can never
  escape it once path separators are gone.
- The database `ProductAsset.storageKey` column is `@unique`, so even a
  vanishingly unlikely id-generator collision is caught by the database
  rather than silently overwriting another asset's file.

## Controlled downloads — never a raw public object URL

- Every download is a **time-limited, HMAC-signed URL**
  (`StorageProvider.createSignedDownloadUrl`), verified server-side
  (`verifySignedDownload`) before any byte is read — signature, expiry, and
  (when present) the bound `downloadFilename` are all checked together, so
  the visible filename can't be swapped independently of the signed key.
- Product asset downloads (`GET /api/catalog/products/{publicId}/assets/
{assetId}/download`) additionally enforce **visibility**: a `PUBLISHED`
  asset is downloadable by anyone; a `DRAFT`/`ARCHIVED` asset requires an
  authenticated caller holding `catalog.write`, and an unauthorized request
  gets the exact same 404 as a genuinely unknown asset — it never confirms
  that an unpublished asset exists.
- The signed URL's `filename` parameter is always the asset's editorial
  `displayName` (plus a validated extension), never the internal
  `storageKey` — `apps/web/src/app/api/media/download/route.ts` also strips
  quotes/control characters before writing it into the
  `Content-Disposition` header, so it cannot inject a second header or break
  out of the quoted filename.

## Environment configuration and secrets

Status: implemented as of ADR-0016 (`docs/adr/0016-dotenvx-environment-workflow.md`)
— read that ADR for full rationale, version/integrity evidence, and the
future encrypted-`.env` workflow this section summarizes.

- **Application code never reads a `.env` file directly.**
  `packages/infrastructure/src/env.ts`'s `loadEnv()` reads only
  `process.env`, validated by a zod schema, and fails closed (throws) on any
  missing/malformed required value. Nothing in `packages/domain`,
  `packages/application`, `packages/ui`, or route/UI code imports
  `dotenv`/`@dotenvx/dotenvx`.
- **`dotenvx` is a local/CI launch-time convenience only.** It is invoked
  exclusively as a CLI wrapper (`dotenvx run -f ../../.env --ignore
MISSING_ENV_FILE -- <command>`) inside `package.json` scripts
  (`apps/web`'s `dev`/`start`, `apps/worker`'s `start`,
  `packages/infrastructure`'s `db:*`/`test:integration`). It never runs in a
  Docker `CMD` (those bypass `package.json` scripts entirely) and never
  overrides an already-set environment variable (no script uses
  `--overload`), so CI/Docker/the Pi scripts — none of which use a `.env`
  file — are unaffected by its presence.
- **The production/staging secret store is always authoritative.** CI uses
  GitHub Actions secrets/environment variables; Docker/deployment injects
  real values as container env vars at start, never bakes them into an image
  layer. `dotenvx` does not and must not replace either.
- **Never commit** a plaintext `.env`, `.env.local`, `.env.production`,
  `.env.keys`, or any other secret-bearing local environment file.
  `.env.keys` (and any `.env.*.keys`) must never be committed, copied into a
  container, printed, or logged. Enforced by:
  - `.gitignore`'s explicit `.env.keys`/`.env.*.keys` lines (on top of the
    pre-existing `.env.*` pattern);
  - `.dockerignore`'s identical exclusions (so a Docker build context can
    never pick one up, even transiently);
  - the CI `security` job's `dotenvx precommit`/`dotenvx prebuild` steps,
    which fail closed the instant any `.env*`-pattern file on disk is
    neither gitignored/dockerignored, `.env.example` itself, nor
    dotenvx-encrypted ciphertext.
- **Future encrypted-environment-file workflow (not yet enabled):** an
  encrypted `.env.<environment>` may only be committed after an explicit
  Product Owner/security decision. The matching `.env.<environment>.keys`
  private key is stored only in the approved CI/VPS secret store — never
  committed, copied into a container, printed, or logged. Production private
  keys are injected at deployment-secret-store runtime, never baked into an
  image layer. Rotation = re-encrypt with a new keypair and update the
  secret store; revocation = delete the key from the secret store (the
  encrypted file becomes unreadable until a new key is provisioned — the
  intended fail-closed response to a suspected key leak).
- **`.env.example`** stays plaintext, complete, and non-secret by
  construction — `packages/infrastructure/src/env-example.test.ts` (run as
  part of the normal `pnpm run test`/CI `unit` job) asserts it resolves
  against the live zod schema and that no
  `SESSION_SECRET`/`MEDIA_SIGNING_SECRET`/`OIDC_CLIENT_SECRET` value is
  present in it.

## Known MVP limitations (tracked, not hidden)

- `LocalFilesystemStorageProvider` has no durability/replication guarantee
  and must never be used in production (ADR-0006 pending).
- `DevMalwareScanner` only recognizes the industry-standard EICAR test
  string; it is not a substitute for a real antivirus/content-scanning
  service (ADR-0006 pending).
- Rate limiting on the product-asset upload endpoints reuses the shared
  `upload` bucket (`apps/web/src/server/rate-limit.ts`) — single-process
  in-memory only, documented there as needing a shared store once more than
  one app instance runs.
