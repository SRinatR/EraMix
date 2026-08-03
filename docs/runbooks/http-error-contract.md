# HTTP response and error-handling contract

Authoritative, English, living contract for every HTTP status code EraMix's
`apps/web` (public site + admin + API) and `apps/worker` may emit, and for
RFC 9457 Problem Details usage. Mandatory for every route/handler/page
change (see `CLAUDE.md`'s "For any public-site, content, SEO, analytics, or
deployment task, read the roadmap and the applicable runbook completely
before changing code" — this runbook is the applicable one for any
status-code, redirect, or error-response change). Governed by ADR-0020.

This document does not attempt to cover every status code in the MDN/IANA
registry. It defines only the statuses applicable to EraMix's public pages,
APIs, auth, uploads, redirects, rate limiting, background integrations and
deployment boundaries, per the Product Owner's explicit scope instruction.

## Architecture: one central mapping, no ad-hoc responses

```
route handler (throws)
  -> typed DomainError subclass (packages/domain/src/errors.ts)
    -> ERROR_CATALOGUE (packages/contracts/src/error-catalogue.ts) — one row per code, one canonical status
      -> toProblemDetails() (packages/contracts/src/domain-error-mapper.ts)
        -> problemResponse() (apps/web/src/server/problem-response.ts) — the ONLY place that builds an
           application/problem+json body from a caught error
```

`withApiHandler` (`apps/web/src/server/handler.ts`) wraps every API route
handler and calls `problemResponse()` in its `catch` block. **A route
handler must never construct its own `NextResponse.json({..., status:
N})` error body.** If a new failure mode needs a new status/code, add a
`DomainError` subclass + a catalogue row + (if the code is genuinely
context-dependent) split it into two distinct codes — never branch on
status inside a route handler. This is what "central mapping" means
operationally: one file (`error-catalogue.ts`) is the single source of
truth for code→status, and one function (`toProblemDetails`) is the only
translator.

Each `ErrorCatalogueEntry` has exactly **one** canonical `status`. A prior
version of this catalogue stored `status: readonly number[]` for a few
codes to leave room for "maybe 403 or 409" ambiguity; in practice the
mapper only ever read the first entry, so the extra entries were dead and,
worse, misleading. If a single error code can legitimately map to two
different statuses depending on where it is thrown, that is a modeling
smell — split it into two codes (see `LOCALE_NOT_SUPPORTED`'s correction
below) rather than encoding ambiguity in the catalogue.

## RFC 9457 Problem Details field contract

Every API failure body is `application/problem+json` with:

| Field      | Required                                | Meaning                                                                                                                                                            |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`     | yes                                     | `https://eramix.dev/problems/{code-kebab-case}` — stable, dereferenceable in form only (no hosted page yet; the URI is an identifier, RFC 9457 §3.1 permits this). |
| `title`    | yes                                     | Short, stable, human-readable summary of the error **class** (not the specific instance). English only today — see "Localization gap" below.                       |
| `status`   | yes                                     | The HTTP status of this specific response, duplicated from the response line per RFC 9457.                                                                         |
| `detail`   | recommended                             | Instance-specific, safe-to-display English text (`error.message` on the thrown `DomainError`). Never a stack trace, SQL fragment, file path, or secret.            |
| `code`     | yes (EraMix extension)                  | Stable machine-readable code from `DomainErrorCode`/`ErrorCode` — the field API clients and admin-UI `catch` blocks key off.                                       |
| `traceId`  | yes when available                      | The W3C-trace-context-correlated ID (`apps/web/src/server/trace.ts`) — the correlation ID this contract requires on every 4xx/5xx.                                 |
| `instance` | no                                      | Not populated today (would be a URI identifying this specific occurrence, e.g. a support-ticket deep link) — reserved, not required.                               |
| `errors`   | only on field-level validation failures | `{pointer, code, message}[]` — zod issue list for `VALIDATION_FAILED`.                                                                                             |

**Localization gap (explicit, tracked, not silently accepted as
permanent):** `title`/`detail` are English-only. Admin-UI error rendering
(`setError(problem.detail ?? problem.title ?? '<fallback>')`, used in every
admin form) already prefers `detail` (usually English, since almost every
`DomainError` sets an English `message`), but a handful of paths (notably
the generic 500 fallback and the zod-validation branch) used to hardcode a
Russian `title` — corrected to English in the same change that added this
contract (ADR-0020). Per-locale (`ru`/`uz`) Problem Details translation is
not implemented; the public site's own pages (product/category/article/
page 404s, the 410 page) are already properly localized in `en`/`ru`/`uz`
via `apps/web/src/server/gone-response.ts` and `not-found.tsx`/App Router
locale segments — only the **API** Problem Details body is English-only.
Full API-response localization is future work, not required for this
contract's MVP scope (API consumers are primarily admin staff and the
public site's own `fetch` calls, both of which already read `detail`, an
English field, and display it as-is).

## Correlation ID

Every Problem Details response includes `traceId` when the request has one
(`apps/web/src/server/trace.ts`'s `traceIdFromRequest`, threaded from the
inbound W3C `traceparent` header or freshly generated). This is the
"correlation/trace ID" this contract requires — it is the same ID emitted
in the structured JSON access/error log line for that request
(`apps/web/src/server/handler.ts`), so a support engineer can join a
client-visible `traceId` to server logs without any additional lookup
table.

## Status code mapping

### 2xx — success

| Status             | When                                                                            | Notes                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **200 OK**         | Successful read (GET), successful update that returns a representation (PATCH). | Default for `NextResponse.json(body)`.                                                                                                                                                                                                                                                                                             |
| **201 Created**    | Successful resource creation (POST).                                            | Every `create*` API route (`createProduct`, `createOffer`, `uploadMedia`, ...) returns `{status: 201}` with the created representation. No `Location` header is set today (the created representation already carries its own `id`/`publicId`; adding `Location` is a low-risk future enhancement, not required by this contract). |
| **202 Accepted**   | Async work enqueued, not yet complete.                                          | `POST /api/analytics/events` returns 202 — the event is durably enqueued to the outbox, not yet dispatched to GA4/Yandex Metrica/Rust (apps/worker does that asynchronously). This is the only 202 in the codebase today; any future "enqueue and process later" endpoint uses 202, never 200/201.                                 |
| **204 No Content** | Empty successful operation.                                                     | `OPTIONS` (Next.js auto-implements this — see 405 below). No route currently needs a body-less success (deletes are modeled as status transitions with a returned representation, not hard deletes) — reserved for a future hard-delete endpoint if one is ever added.                                                             |

### 3xx — redirects

**Rule: 301/308 only for canonical permanent normalization; 302/303/307
only for intentional temporary/auth/post-action navigation. Never use a
302/303/307 as a substitute for a permanent canonical redirect — that
dilutes link equity and is explicitly forbidden by
`docs/runbooks/search-visibility.md`.**

| Status                     | When                                                                                                                                                                                                                                                                                                                                                                        | Call sites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **308 Permanent Redirect** | A published translation's prior canonical slug/route was superseded (CLAUDE.md: "A prior published slug must return a single `308` redirect to the current canonical URL"). Preserves the request method.                                                                                                                                                                   | `permanentRedirect()` (Next.js `next/navigation`, defaults to 308 — verified against the installed `next@16.2.12` source, `dist/lib/redirect-status.js`) in `apps/web/src/app/[locale]/{articles,pages,catalog}/[slug]/page.tsx` when `resolveContentRoute`/`resolveCategoryRoute`/`resolveProductRoute` returns `{kind: 'redirect'}`.                                                                                                                                                                                                                                                                                                                                             |
| **301 Moved Permanently**  | Not currently emitted. Reserved for a future non-method-preserving permanent redirect (e.g. a legacy external-inbound-link normalization) if one is ever needed; EraMix's own route-history mechanism always uses 308 because it must preserve method semantics for any non-GET client (defensive; today only GET traffic hits these pages, but 308 is correct regardless). | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **307 Temporary Redirect** | One-time, non-cacheable, method-preserving navigation: starting the OIDC Authorization Code flow, returning from the OIDC callback, and redirecting to a time-limited signed media-download URL.                                                                                                                                                                            | `NextResponse.redirect(url)` defaults to 307 (verified against `next@16.2.12`'s `dist/server/web/spec-extension/response.js`) in `apps/web/src/app/api/auth/login/route.ts`, `apps/web/src/app/api/auth/callback/route.ts`, `apps/web/src/app/api/catalog/products/[publicId]/assets/[assetId]/download/route.ts`. The download redirect is the clearest case: a signed URL that expires in 3600s must never be cached or treated as permanent — 307 (or 302) is structurally required, 308 would be a bug. `redirect()` (`next/navigation`) also defaults to 307 for the various "must authenticate first" page redirects (`redirect('/api/auth/login')` in account/admin pages). |
| **303 See Other**          | Reserved for "redirect a POST to a GET of the result" (the classic post-action navigation pattern). Not currently emitted — EraMix's mutating API routes return the created/updated representation directly (200/201) rather than redirecting; admin UI forms `fetch()` and `router.refresh()` client-side instead of relying on a server-side 303.                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **302 Found**              | Not currently emitted; 307 is used instead everywhere a temporary redirect is needed, because 307 is the strictly stronger guarantee (also preserves method) and Next.js's own defaults already produce it.                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 304 Not Modified

Standard HTTP cache validation (`If-None-Match`/`If-Modified-Since`),
entirely infrastructure/framework-controlled — Next.js's static asset and
`fetch`-cache layers emit this automatically for cacheable responses; no
EraMix application code constructs a 304 directly, and none should.

### 4xx — client errors

| Status                                  | Code(s)                                                                                 | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **400 Bad Request**                     | `MALFORMED_REQUEST`                                                                     | The request body cannot even be parsed as JSON (`await request.json()` throws a `SyntaxError`) — distinct from a well-formed-but-invalid body (422). Previously this fell through to the generic 500 handler (a real bug: a client typo was reported as "unexpected internal failure"); fixed as part of ADR-0020.                                                                                                                                                                                                                                                                                                                                                                                  |
| **401 Unauthorized**                    | `AUTH_REQUIRED`, `AUTH_CALLBACK_FAILED`                                                 | No valid session cookie (`requireActor`/`getServerActor` finds none), or the OIDC callback itself fails state/nonce/PKCE/signature/issuer/audience/expiry validation. Never used as a substitute for 403 — a valid session with insufficient permission is always 403, never 401.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **403 Forbidden**                       | `ACCESS_DENIED`, `COMPANY_REQUIRED`                                                     | Authenticated, but the actor's role/permission/company-membership does not allow the action (`requirePermission`, `assertOrderCompanyAccess`), or a same-origin/CSRF check fails on a state-changing request (`assertSameOrigin`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **404 Not Found**                       | `RESOURCE_NOT_FOUND`, and the App Router `notFound()` path for public pages             | See "Anti-enumeration policy" below — this is the intentionally uninformative status for "does not exist, is not published, or is deliberately hidden," by design never distinguishable from the outside.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **405 Method Not Allowed**              | (no `DomainError` — see below)                                                          | A syntactically valid path with an implemented route file, called with a method that route file does not export. Must include `Allow` listing the methods that route _does_ implement (RFC 9110 §15.5.6) — Next.js 16's own default 405 (`autoImplementMethods`, verified against the installed package source) returns a **bare, headerless** 405, which does not satisfy this contract. See "405 implementation" below.                                                                                                                                                                                                                                                                           |
| **409 Conflict**                        | `ORDER_STATE_CONFLICT`, `CONCURRENCY_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `SLUG_CONFLICT` | Optimistic-concurrency version mismatch, an order state-machine transition that is not legal from the current state, a reused `Idempotency-Key` with a different payload, or a slug collision with a current/historical route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **410 Gone**                            | (no `DomainError` — see "410 implementation" below)                                     | Only an explicit, durable retirement (`retiredAt` set — CLAUDE.md's "durable retirement," ADR-0018) of a content/category/product route that has **no successor route** (a route with a successor is a 308, not a 410). Never emitted for a merely-unpublished/draft/missing item — those are 404.                                                                                                                                                                                                                                                                                                                                                                                                  |
| **413 Content Too Large**               | `PAYLOAD_TOO_LARGE`                                                                     | An uploaded file's `sizeBytes` is outside `packages/domain/src/upload-validation.ts`'s `MAX_UPLOAD_SIZE_BYTES` (10 MiB) range. Previously folded into `VALIDATION_FAILED`/422 — split out as part of ADR-0020 so a client can programmatically distinguish "your file is too big" from "your file's metadata is wrong."                                                                                                                                                                                                                                                                                                                                                                             |
| **415 Unsupported Media Type**          | `UNSUPPORTED_MEDIA_TYPE`                                                                | An uploaded file's declared `Content-Type` is not in the allowlist (`ALLOWED_UPLOAD_TYPES` — currently `image/jpeg`, `image/png`, `image/webp`, `application/pdf`). Previously folded into `VALIDATION_FAILED`/422 — split out for the same reason as 413. A **spoofed** file (extension/magic-byte signature does not match an otherwise-allowlisted declared type) stays `VALIDATION_FAILED`/422: the declared media type is supported, the payload's actual content just does not match its own claim — that is a semantic/integrity failure, not an unsupported-type failure.                                                                                                                   |
| **422 Unprocessable Content**           | `VALIDATION_FAILED`, `LOCALE_NOT_SUPPORTED` (corrected — see below)                     | Syntactically valid input (parses fine as JSON/multipart) that fails domain/semantic validation: a zod schema mismatch, a `validateEffectiveX` domain-invariant violation, an upload's extension/signature mismatch, or an unsupported `locale` value on a body/form field (`parseLocale`, used today only by the admin product-asset-upload form's optional `locale` field — a body-field context, not URL routing, so 422 is correct; this entry previously read 404, inherited from a design that assumed `parseLocale` would gate URL locale segments, which in fact use `isSupportedLocale()` + `notFound()` directly and never throw a `DomainError` at all — corrected as part of ADR-0020). |
| **429 Too Many Requests**               | `RATE_LIMITED`                                                                          | `enforceRateLimit()` (`apps/web/src/server/rate-limit.ts`) on auth, search, order-submission, upload, admin, and analytics-ingestion buckets. Always includes `Retry-After` (seconds) — `problemResponse()` reads `error.details.retryAfterSeconds` and sets the header whenever `code === 'RATE_LIMITED'`.                                                                                                                                                                                                                                                                                                                                                                                         |
| **431 Request Header Fields Too Large** | infrastructure-owned                                                                    | Node.js's own HTTP server enforces `--max-http-header-size` (default 8 KiB as of the pinned Node 24 baseline) before any EraMix request handler ever runs; a reverse proxy in front of production would enforce its own, typically smaller, limit first. No application code can intercept or construct this response — documented here so it is not mistaken for a missing mapping.                                                                                                                                                                                                                                                                                                                |
| **451 Unavailable For Legal Reasons**   | not implemented                                                                         | Only for content removal explicitly required by law and approved by legal/operations (CLAUDE.md's fail-closed change-management policy — this is exactly the kind of "explicit Product Owner/legal decision" gate CLAUDE.md requires before implementing). No current requirement exists; do not add a speculative code path or admin toggle for this ahead of an actual legal requirement.                                                                                                                                                                                                                                                                                                         |
| **499 Client Closed Request**           | never emitted by application code                                                       | Nginx-only, non-standard convention for "the client disconnected before the server finished." May appear in upstream reverse-proxy access logs in production; EraMix's own `NextResponse`-based handlers cannot construct this status (Node's `http` module rejects it), and no code should attempt to. Documented so a `499` seen in production log aggregation is correctly understood as an upstream signal, not an application bug to chase.                                                                                                                                                                                                                                                    |

### 5xx — server errors

| Status                                                                                                                                                                                           | Code(s)                                       | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **500 Internal Server Error**                                                                                                                                                                    | `INTERNAL_ERROR`, `CANONICAL_ROUTE_MISSING`   | Any caught error that is neither a `DomainError` nor a `ZodError` nor a body-parse `SyntaxError` — genuinely unexpected. `problemResponse()`'s fallback branch never includes the original error's message or stack; only the fixed, safe `INTERNAL_ERROR` title/detail and `traceId` are returned. `CanonicalRouteMissingError` (an internal invariant violation — a published translation with no canonical route) is deliberately mapped to 500, not 404/409: it signals a bug in EraMix's own data, never something the caller did wrong.                                                                                                                              |
| **501 Not Implemented**                                                                                                                                                                          | not currently emitted                         | Reserved for a capability that is intentionally, permanently unsupported by a given endpoint (distinct from 405's "wrong method for this endpoint," and distinct from a not-yet-built feature, which simply should not have a route at all yet). No current endpoint needs this — do not add a speculative 501 branch ahead of a genuine "we will never support X here" case.                                                                                                                                                                                                                                                                                              |
| **502 Bad Gateway**                                                                                                                                                                              | infrastructure-owned                          | Emitted by a reverse proxy/load balancer when an upstream (Next.js `apps/web`, or a future gateway in front of `apps/worker`) is unreachable or returns a malformed response. No application code constructs this.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **503 Service Unavailable**                                                                                                                                                                      | `DEPENDENCY_UNAVAILABLE`                      | `GET /health/ready` returns 503 when the required PostgreSQL dependency is unreachable (`apps/web/src/app/health/ready/route.ts`) — this is the one 503 EraMix's own code emits today. No `Retry-After` is set on this path: the outage duration is never "known" for an ad-hoc DB-unreachable condition. A future planned-maintenance-mode 503 (not implemented today — no `PlatformSettings` maintenance flag exists yet) would set a known `Retry-After`; this contract requires that if/when that flag is built. Never cache a 503 as if it were permanent — `/health/ready` is already `Cache-Control`-exempt (health endpoints are never in the Next.js data cache). |
| **504 Gateway Timeout**                                                                                                                                                                          | infrastructure-owned                          | Emitted by a reverse proxy/load balancer when an upstream does not respond in time. No application code constructs this; the closest application-level analogue is `health/ready`'s own 2-second internal DB-check timeout, which resolves to a 503 (dependency unavailable), not a 504 (EraMix is the origin, not a gateway, from the perspective of that check).                                                                                                                                                                                                                                                                                                         |
| **505 HTTP Version Not Supported**, **507 Insufficient Storage**, **508 Loop Detected**, **511 Network Authentication Required**, and WebDAV/proxy-only statuses (207, 226, 306, 421, 425, 505+) | infrastructure-owned, not application-emitted | None of these are meaningful at the Next.js application layer for EraMix's current architecture (no WebDAV, no HTTP/2-specific negotiation logic, no captive-portal scenario). Documented here, not implemented, per the Product Owner's explicit instruction not to manufacture support for inapplicable codes. Revisit only if a future approved component (e.g. a genuinely different protocol gateway) needs one.                                                                                                                                                                                                                                                      |

## Anti-enumeration policy (formalized)

This section formalizes behavior that already existed de facto before this
contract, rather than introducing a new mechanism:

- **Public, anonymous pages** (article/page/category/product detail):
  `resolveContentRoute`/`resolveCategoryRoute`/`resolveProductRoute`
  (`packages/application/src/route-resolution.ts`) return the same
  `{kind: 'not-found'}` for a slug that never existed, a slug belonging to
  a DRAFT/ARCHIVED (not `PUBLISHED`) item, and a slug with no translation
  for the requested locale. All three render the same `notFound()` page —
  an anonymous visitor can never distinguish "never existed" from
  "exists but is unpublished" from a 404 alone. This is intentional: the
  public site does not leak content-editorial state to anonymous crawlers
  or visitors.
- **Authenticated, resource-ownership checks** (orders): a known
  `orderNumber` belonging to a different company than the actor's returns
  **403** (`assertOrderCompanyAccess`, `ACCESS_DENIED`), not 404. This is a
  deliberate, different tradeoff from the public-page case: an
  authenticated actor with general `order.read.own` permission is not an
  anonymous crawler, and 403 gives a clearer, more actionable error to a
  legitimate confused user (e.g. a wrong order number typo) without
  meaningfully aiding enumeration (order numbers are not sequential/
  guessable — see `packages/domain`'s order-number generation). If a
  future resource type needs the stricter "hide existence even from other
  authenticated actors" behavior, model it with 404, not 403, and note the
  reasoning at that call site.
- **Admin/staff routes**: always 401 first (no session), then 403
  (insufficient permission), then whatever status the operation itself
  would return. Staff routes never return 404 to hide an existing
  resource from an under-permissioned staff member — that is what 403 is
  for; 404 on an admin route means the resource genuinely does not exist.

## 405 implementation

Next.js 16's built-in `autoImplementMethods` (verified against the
installed `next@16.2.12` package source,
`dist/server/route-modules/app-route/helpers/auto-implement-methods.js`)
auto-implements `HEAD` (from `GET`) and `OPTIONS` (204 + a correct `Allow`
header) for every route file, but its default for every other
unimplemented method is a **bare `405` with no body and no `Allow`
header** — non-compliant with RFC 9110 §15.5.6 ("MUST generate an Allow
header field"). EraMix does not rely on this default: route files export
a `methodNotAllowed(allowed)` handler (`apps/web/src/server/handler.ts`)
for every standard method they do not otherwise implement, which returns
an RFC 9457 body with `code: 'METHOD_NOT_ALLOWED'` and a correct `Allow`
header. Rollout across all route files is tracked incrementally (see the
implementation-status table below) — a route file with no explicit
`methodNotAllowed` export yet still falls back to Next's bare default,
which is a known, tracked gap, not a silent one.

## 410 implementation

See ADR-0018 for the full architectural decision (proxy.ts is the only
Next.js 16 surface that can set an arbitrary status with a real body
before the App Router renders anything). Summary: `apps/web/src/proxy.ts`
matches locale-prefixed content/category/product detail paths, resolves
them, and returns `apps/web/src/server/gone-response.ts`'s real `410`
response (localized `en`/`ru`/`uz` HTML, `<meta name="robots"
content="noindex">`, no reproduction of the original content) only when
the resolution kind is `'retired'` (a durable, one-way `retiredAt`
timestamp — never a merely-unpublished item).

## Public error-page caching, robots, canonical and monitoring behavior

- **404** (`apps/web/src/app/[locale]/not-found.tsx`): rendered by the App
  Router's `notFound()` boundary. Must never be cached as if it were a
  real page (Next.js does not statically cache a `notFound()` response by
  default) and must carry `<meta name="robots" content="noindex">` so an
  accidentally-crawled dead link is not indexed — **gap**: the current
  `not-found.tsx` sets no `<meta>`/`generateMetadata` at all (tracked
  below; corrected in a follow-up slice of this same initiative). No
  canonical link is emitted for a 404 — there is nothing to canonicalize.
- **410**: `gone-response.ts` already sets `<meta name="robots"
content="noindex">` directly in its hand-built HTML (it bypasses the App
  Router's metadata API entirely, since it is built in `proxy.ts` before
  any page renders) and sets no `Cache-Control` header, which is correct —
  a 410 must be re-checked by crawlers, not cached as permanent, and
  Next.js's proxy layer applies no implicit caching to a `NextResponse`
  built this way.
- **5xx**: `apps/web/src/app/[locale]/error.tsx` is a client-side React
  error boundary — it never sets HTTP-level headers (by the time it
  renders, the response has already started streaming with whatever
  status the failing Server Component/route produced). API-route 5xx
  responses (`problem-response.ts`) set no explicit `Cache-Control`
  either; Next.js does not cache route-handler responses by default
  unless explicitly configured, so no additional header is required today.
  **Monitoring**: every 5xx (API) is logged via `apps/web/src/server/
handler.ts`'s structured `http_request_failed` JSON log line at `error`
  severity with `traceId`/`route`/`status`/`durationMs` —
  `docs/runbooks/security.md`/observability tooling (OpenTelemetry/OTLP,
  CLAUDE.md's observability mandate) is the alerting layer on top of that
  log stream; no new logging is introduced by this contract, it documents
  the existing mechanism as satisfying this contract's monitoring
  requirement.

## Testing requirements

Every status code this contract implements (i.e. every row above that is
not "infrastructure-owned"/"not implemented") requires a route-level test
asserting: the exact status code, the RFC 9457 body shape where
applicable (`code`, `status`, `traceId`), and any mandated header
(`Location` for 3xx, `Allow` for 405, `Retry-After` for 429/503-when-
known). Existing coverage before this contract: 429 (`Retry-After`,
`rate-limit`-adjacent tests), 409 (concurrency, via
`postgres.integration.test.ts` and application-layer tests), 422
(`domain-error-mapper.test.ts`, per-route zod tests), 401/403 (pervasive
across every RBAC-gated route's tests), 404 (`route-resolution.test.ts`).
Gaps this contract's implementation slices close incrementally: 307/308
redirect `Location`+status assertions (no route test existed for any of
the three redirect-emitting API routes before ADR-0020), 405+`Allow`
(no route implemented or tested this before ADR-0020), 413/415 (previously
indistinguishable from 422, so untestable as distinct codes), 400
(malformed-JSON path was previously untested and mis-mapped to 500).

## Implementation status

Tracked here and kept current as each slice lands (mirrors
`docs/IMPLEMENTATION_ROADMAP.md`'s own evidence-based status-block
convention; this table is the fast-reference summary, the roadmap entry is
the detailed evidence). "Done" means implemented **and** tested **and**
merged to `main` with a green CI run.

| Area                                                                                    | Status                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Central mapping architecture (`ERROR_CATALOGUE`, `toProblemDetails`, `problemResponse`) | Pre-existing, audited for this contract                                                                                                                                                                                                                                           |
| Single canonical `status` per catalogue entry (removed dead `[a, b]` ambiguity)         | Done (ADR-0020)                                                                                                                                                                                                                                                                   |
| `LOCALE_NOT_SUPPORTED` corrected from 404 to 422                                        | Done (ADR-0020)                                                                                                                                                                                                                                                                   |
| English-only Problem Details `title`/`detail` (removed hardcoded Russian strings)       | Done (ADR-0020)                                                                                                                                                                                                                                                                   |
| 400 for malformed (unparseable) JSON request bodies                                     | Done (ADR-0020)                                                                                                                                                                                                                                                                   |
| 413/415 split out of `VALIDATION_FAILED` for uploads                                    | Done (ADR-0020)                                                                                                                                                                                                                                                                   |
| Route-level tests: auth login/callback/download redirects (307/308, `Location`)         | Done (ADR-0020)                                                                                                                                                                                                                                                                   |
| 405 + `Allow` shared helper (`methodNotAllowed`)                                        | Helper built; rollout to all 61 route files in progress, tracked in the roadmap                                                                                                                                                                                                   |
| 404 page `robots noindex` metadata                                                      | Gap — tracked, not yet closed                                                                                                                                                                                                                                                     |
| OpenAPI response contracts for the new codes (400/413/415/405)                          | Tracked, not yet closed                                                                                                                                                                                                                                                           |
| Traceability matrix entry                                                               | Deferred to Phase 8 per its own unmet precondition (see `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 8 status) — this contract's requirement-to-evidence mapping is: ADR-0020 (architecture), this runbook (contract), the implementation commits (diffs), CI run URLs (verification) |
