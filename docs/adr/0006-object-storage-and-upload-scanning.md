# ADR-0006: Object storage and upload scanning provider

- Status: Blocked — pending Q-06
- Date: 2026-08-01
- Requirement source: TZ v1.1 §14, Appendix D (ADR-006, "До Catalog assets"),
  §21 Q-06

## Context

§14 requires S3-compatible object storage with public/private bucket
separation, checksum tracking, and a malware-scanning integration point for
uploads (catalog media, documents). TZ §21 Q-06 states hosting, email, and
object storage have not been chosen; this ADR covers the object-storage and
scanning slice of that decision.

## Decision

Not made. Blocked pending an Architecture decision on:

- S3-compatible provider (or self-hosted MinIO/equivalent) and region.
- Bucket/prefix layout for public assets vs. private documents.
- Malware-scanning integration (provider or self-hosted ClamAV-equivalent)
  wired as a required step before an upload is marked usable.

## Consequences

Phase 6 (Admin, media) cannot implement `ProductAsset` upload handling or
signed-URL/proxy download until this is resolved.
