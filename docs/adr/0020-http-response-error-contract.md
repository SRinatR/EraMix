# ADR-0020: Authoritative HTTP response and error-handling contract

- Status: Accepted
- Date: 2026-08-03
- Requirement source: Product Owner instruction, 2026-08-03 ("Add an
  authoritative HTTP response and error-handling contract to the existing
  English project documentation, then implement it incrementally... Define
  and test every status code that is applicable to EraMix's public pages,
  APIs, auth, uploads, redirects, rate limiting, background integrations
  and deployment boundaries" — full required minimum mapping and
  requirements list quoted in `docs/runbooks/http-error-contract.md`'s
  introduction).

## Context

Before this change, EraMix already had a working central error-mapping
pipeline (`DomainError` subclasses → `ERROR_CATALOGUE` →
`toProblemDetails()` → `problemResponse()`), RFC 9457 Problem Details, a
real 410 mechanism (ADR-0018), and correct rate-limit/`Retry-After`
handling — but the mapping had never been audited end to end against a
single authoritative document, and auditing it surfaced concrete,
independently-verifiable defects:

- `ERROR_CATALOGUE` stored `status: readonly number[]` for several codes
  (`COMPANY_REQUIRED: [403, 409]`, `CONCURRENCY_CONFLICT: [409, 412]`,
  `LOCALE_NOT_SUPPORTED: [404, 422]`) but `toProblemDetails()` only ever
  read `status[0]` — the second entries were dead, misleading scaffolding.
- `LOCALE_NOT_SUPPORTED`'s live status (`status[0] = 404`) was actually
  wrong for its only real call site: `parseLocale()` is thrown only from
  the admin product-asset-upload form's optional `locale` **body field**
  (verified by grepping every call site), never from URL locale-segment
  routing (which uses `isSupportedLocale()` + `notFound()` directly and
  never constructs a `DomainError`). A body-field allowlist failure is a
  422, not a 404.
- A malformed (unparseable) JSON request body — `await request.json()`
  throwing a `SyntaxError` — was not caught anywhere and fell through to
  the generic 500 branch, reporting a client typo as an "unexpected
  internal failure."
- Upload size violations and unsupported-media-type violations were both
  folded into the single `VALIDATION_FAILED`/422 code
  (`packages/domain/src/upload-validation.ts`), giving a client no way to
  programmatically distinguish "your file is too big" (413) from
  "your file type isn't supported" (415) from a genuine semantic mistake
  (422).
- Next.js 16's own default 405 (verified against the installed
  `next@16.2.12` package source) returns a bare, headerless response with
  no `Allow` header — non-compliant with RFC 9110 §15.5.6.
- `problemResponse()`'s zod-validation and generic-500 branches hardcoded
  Russian-language `title` strings even though `detail` (the field the
  admin UI actually prefers, per every `setError(problem.detail ??
problem.title ?? ...)` call site) is English everywhere else, and the
  site's default locale is English (CLAUDE.md).
- No route-level tests existed for any of the three redirect-emitting API
  routes (`auth/login`, `auth/callback`, the signed-download redirect), nor
  for 405/`Allow`, nor for the (until now, non-existent) 400/413/415
  distinctions.

Given the scope (every route, every status code applicable to this
architecture), the Product Owner explicitly authorized incremental
delivery: a single authoritative contract document first, then small,
separately verified and committed implementation slices.

## Decision

`docs/runbooks/http-error-contract.md` is the authoritative, living HTTP
response and error-handling contract — mandatory reading before any
status-code, redirect, or error-response change, the same way
`docs/runbooks/search-visibility.md` is mandatory for SEO/routing changes.
It defines, for every status code applicable to this architecture (not the
full IANA registry): when it is used, which `DomainErrorCode` (if any) maps
to it, required headers, and whether it is application-emitted or
infrastructure-owned/not-applicable-here.

Implementation follows the contract, delivered as separate, independently
tested and CI-verified commits:

1. **Catalogue correctness**: `ErrorCatalogueEntry.status` becomes a single
   `number`, never an array. `LOCALE_NOT_SUPPORTED` is corrected to 422.
   `COMPANY_REQUIRED` (currently unused by any call site) keeps a single
   canonical 403. `CONCURRENCY_CONFLICT` keeps 409 (412 was never used and
   is dropped, not preserved as an unreachable alternative).
2. **English-only Problem Details text**: the two hardcoded Russian
   strings in `problem-response.ts` (zod-validation title, generic-500
   title) become English, matching every other `DomainError` message in
   the codebase. Full per-locale (`ru`/`uz`) Problem Details translation
   remains explicitly out of scope (tracked as future work in the runbook,
   not silently dropped) — the public site's own pages are already
   properly localized; only the API's machine-readable error body is
   English-only.
3. **400 for malformed JSON**: `problemResponse()` gains a `SyntaxError`
   branch (checked before the generic 500 fallback) mapping to a new
   `MALFORMED_REQUEST` code, 400.
4. **413/415 for uploads**: two new `DomainError` subclasses,
   `PayloadTooLargeError` (413) and `UnsupportedMediaTypeError` (415),
   replace the two size/allowlist branches in `validateUpload()` that
   previously threw `ValidationFailedError`. The extension-mismatch and
   magic-byte-signature-mismatch branches deliberately stay
   `ValidationFailedError`/422 — those are "your claimed type doesn't
   match your actual content" (a semantic/integrity failure), not "your
   content-type is fundamentally unsupported" (415).
5. **405 + `Allow`**: a shared `methodNotAllowed(allowed: readonly
string[])` helper in `apps/web/src/server/handler.ts` returns an RFC
   9457 body (`code: 'METHOD_NOT_ALLOWED'`) with a correct `Allow` header,
   replacing reliance on Next's bare default. Rollout across all route
   files is incremental (tracked in the runbook's implementation-status
   table and the roadmap), not a single all-61-files commit — each batch
   is independently tested.
6. **Redirect route tests**: the three redirect-emitting API routes gain
   tests asserting the exact status (307, verified against installed
   `next@16.2.12` source as `NextResponse.redirect()`'s and `redirect()`'s
   shared default) and `Location` header.
7. **OpenAPI + traceability**: the new codes (`MALFORMED_REQUEST`,
   `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `METHOD_NOT_ALLOWED`) are
   added to `ProblemDetails.code`'s enum and given shared
   `components/responses` entries reused across the OpenAPI paths that can
   emit them. The traceability matrix does not exist yet (Phase 8's own
   precondition is unmet, per `IMPLEMENTATION_ROADMAP.md`) — this ADR plus
   the runbook plus the implementation commits plus their CI run URLs is
   the evidence trail a future matrix will cite for this requirement, per
   the same pattern already established for ADR-0019.

No architectural boundary changes: the modular-monolith layering, the
public URL grammar, and the persistence model are unchanged. This ADR
formalizes and corrects the existing central-mapping pattern; it does not
introduce a new one.

## Consequences

- `LOCALE_NOT_SUPPORTED`'s status changing from 404 to 422 is a breaking
  change for any external API consumer relying on the old (incorrect)
  value — there is exactly one call site in this codebase today (the admin
  product-asset-upload form), which is corrected in the same change; no
  other consumer exists yet (pre-GA API, no external integrators).
- `ValidationFailedError` instances thrown by `validateUpload()` for size/
  content-type are now `PayloadTooLargeError`/`UnsupportedMediaTypeError`
  instead — any test or client code asserting `ValidationFailedError`
  specifically for those two cases must be updated (verified no such
  assertion exists outside `upload-validation.test.ts` itself, which is
  updated in the same commit).
- The 405+`Allow` rollout is intentionally incomplete after the first
  implementation slice (helper built, applied to a representative subset).
  A route file not yet migrated still returns Next's bare default 405 —
  a known, tracked gap (runbook's implementation-status table), not a
  silent one; CLAUDE.md's "do not leave broken scaffolding" is satisfied
  because every migrated route is fully correct and tested, and the
  unmigrated remainder's current (pre-existing, unchanged) behavior is
  explicitly documented as a gap rather than misrepresented as fixed.
