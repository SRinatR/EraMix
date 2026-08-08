# ADR-0006: Object storage and upload scanning provider

- Status: Partially Accepted — object storage resolved 2026-08-08; malware
  scanning remains blocked
- Date: 2026-08-01 (storage decision recorded 2026-08-08, production
  deployment session)
- Requirement source: TZ v1.1 §14, Appendix D (ADR-006, "До Catalog assets"),
  §21 Q-06

## Context

§14 requires S3-compatible object storage with public/private bucket
separation, checksum tracking, and a malware-scanning integration point for
uploads (catalog media, documents). TZ §21 Q-06 states hosting, email, and
object storage have not been chosen; this ADR covers the object-storage and
scanning slice of that decision.

## Decision

**Object storage (Accepted, 2026-08-08)**: Cloudflare R2, a single private
bucket (`eramix-media-prod`, no public/custom domain — the "public/private
bucket separation" requirement is satisfied at the URL layer instead:
`StorageProvider.createSignedDownloadUrl` always returns a time-limited R2
pre-signed URL, never a permanent public object URL). Chosen over
self-hosted MinIO because the initial production host
(`94.232.41.16`/`eramix.uz`) has only 1 vCPU/~1GB RAM — not enough headroom
to run MinIO alongside PostgreSQL 19beta2, the web app, and the worker.
Implemented as `packages/infrastructure/src/r2-storage-provider.ts`
(`R2StorageProvider`, using `@aws-sdk/client-s3` against R2's S3-compatible
endpoint), selected automatically by
`apps/web/src/server/container.ts`'s `storage` getter when
`R2_ACCOUNT_ID`/`R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` are all
set (falls back to `LocalFilesystemStorageProvider` for local dev when unset).

**Malware scanning: still Not made.** Blocked pending an Architecture decision
on a scanning provider (hosted service or self-hosted ClamAV-equivalent)
wired as a required step before an upload is marked usable.
`DevMalwareScanner` (EICAR-signature-only detection) remains the only
scanner in production until this is resolved — every `ProductAsset` records
an honest, non-falsified `malwareScanEngineName` naming it as a dev stub, per
CLAUDE.md's "do not falsely claim files were scanned."

## Consequences

Phase 6 (Admin, media) can now implement real, durable `ProductAsset`
uploads against R2 in production. Real malware scanning remains a follow-up:
until it lands, production uploads are checksum-tracked and type-validated
but not scanned by a production-grade engine — this is a known, documented
gap, not a silently accepted one.
