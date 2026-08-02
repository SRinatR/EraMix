# ADR-0018: Serve durable HTTP 410 (permanently retired) via `proxy.ts`, not `page.tsx`

- Status: Accepted
- Date: 2026-08-03
- Requirement source: CLAUDE.md "Public URL and localization policy" /
  `docs/runbooks/search-visibility.md`'s content retirement policy
  ("Content retirement policy: a permanent removal without a suitable
  successor returns `410`... never merely because content is unpublished,
  missing, or temporarily unavailable" — Product Owner correction,
  2026-08-03), `docs/IMPLEMENTATION_ROADMAP.md` Phase 2 exit criteria
  ("Tests cover... 404/410 cases").

## Context

Next.js 16.2.12's App Router gives a Server Component (`page.tsx`) exactly
three ways to influence the HTTP response: render normally (200), call
`notFound()` (hardcoded 404), or call `redirect()`/`permanentRedirect()`
(307/308). This was verified directly against the installed package, not
assumed: `next/dist/client/components/http-access-fallback/http-access-fallback.js`
hardcodes `HTTPAccessErrorStatus` to `{NOT_FOUND: 404, FORBIDDEN: 403,
UNAUTHORIZED: 401}` and `getAccessFallbackErrorTypeByStatus` only recognizes
those three codes; `next/dist/server/app-render/app-render.js` sets
`res.statusCode` from exactly three sources — that fallback lookup, the
redirect-status lookup, or a hardcoded `500` for any other thrown error.
There is no supported way to emit a `410` (or any other custom status) from
a Server Component page in this Next.js version.

Two Next.js-native surfaces genuinely can set an arbitrary status: a Route
Handler (`route.ts`), and `proxy.ts` (Next.js 16 renamed `middleware.ts`
to `proxy.ts`). Route Handlers cannot coexist with `page.tsx` at the same
route segment, so using one for the rare "retired" case would mean
rewriting `articles/[slug]`, `pages/[slug]`, and `catalog/[slug]` entirely
as Route Handlers — losing the typed `generateMetadata` API, RSC streaming,
and the existing, tested `notFound()`/`redirect()` behavior for the
overwhelmingly common canonical/redirect/not-found cases, just to support a
rare terminal state. Rejected as disproportionate risk to the SEO-critical
hot path.

`proxy.ts` was historically Edge-only, which would have made a Postgres/
Prisma-backed retirement check infeasible there (`@prisma/adapter-pg` needs
Node.js TCP sockets, unavailable in the Edge runtime). This constraint no
longer holds: Next.js 16 always runs `proxy.ts` on the Node.js runtime —
confirmed directly against `next/dist/build/analysis/get-page-static-info.js`,
which throws build-time error `E1031` ("Proxy always runs on Node.js
runtime") if a `proxy.ts` file declares any other runtime. This closes the
gap: `apps/web/src/proxy.ts` (already the site's locale-detection layer, via
`next-intl`'s `createMiddleware`) can safely reuse the same `getContainer()`/
Prisma composition root the pages already use.

## Decision

`apps/web/src/proxy.ts` runs a narrow, pattern-scoped check before handing
off to `next-intl`'s locale middleware: for a request path matching
`/{locale}/(articles|pages|catalog)/{slug}` with a supported locale, it
calls the _same_ `resolveContentRoute`/`resolveCategoryRoute`/
`resolveProductRoute` application-layer functions `page.tsx` already uses.
If the resolution's `kind` is `'retired'`, the proxy returns a real
`NextResponse` with `status: 410` and a minimal, honest, locale-appropriate
HTML body (a "this content has been permanently removed" message plus a
link back to the catalog/home) built manually — it does not attempt to
reproduce the retired resource's original rich content, since a 410 page is
explicitly a terminal, thin, non-cloaking notice, not a live page. Every
other path (all non-matching requests, and matched requests that resolve to
`'canonical'`/`'redirect'`/`'not-found'`) falls through unchanged to
`next-intl`'s existing middleware — zero behavior change to the
already-verified locale-detection flow.

`page.tsx` for the three affected routes is _not_ rewritten. Its
`resolveContentRoute`/`resolveCategoryRoute`/`resolveProductRoute` call sites
gain the new `'retired'` union member (the application layer is the single
source of truth for this decision, reused by both proxy and page) and treat
it identically to `'not-found'` — belt-and-suspenders defense-in-depth in
case a request ever reaches the page without passing through the proxy
(e.g. a future internal caller), never the primary 410 mechanism.

## Consequences

- A retired content/category/product detail request pays for two
  application-layer resolutions per request instead of one (`proxy.ts`'s
  check, then `page.tsx`'s own, for the non-retired majority case) — an
  explicit, accepted latency/DB-load cost, scoped only to the three
  detail-page shapes (home, catalog index, admin, account, and all API
  routes are excluded by the pattern match before any DB call). A future
  optimization could have the proxy pass its resolution to the page via a
  request header to avoid the second query; deferred as unnecessary
  complexity for a first slice — retirement is a rare, deliberate,
  one-way admin action, not a hot path.
- `proxy.ts` now imports `@eramix/infrastructure`/`getContainer()`
  (previously locale-routing-only, no DB access). This is a real new
  coupling, verified safe for `next build` only in the sense that
  `getContainer()` is lazy (no live DB needed at build time, same guarantee
  every other page already relies on) — the actual retired-detection code
  path (a live Postgres query returning a retired row) is **only verified
  by CI's Postgres-integration job**, consistent with every other
  Postgres-backed behavior in this repository; it is not exercised by a
  local dev-server/browser check on this laptop (no local Postgres).
- If a future Next.js major version removes `proxy.ts`'s always-Node.js
  guarantee, this decision must be revisited before upgrading.
