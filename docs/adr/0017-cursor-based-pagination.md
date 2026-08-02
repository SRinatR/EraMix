# ADR-0017: Migrate every list endpoint to cursor-based pagination

- Status: Accepted
- Date: 2026-08-02
- Requirement source: TZ v1.3 §8 API-005 ("Пагинация больших коллекций
  cursor-based; page size ограничен и имеет безопасное значение по
  умолчанию") and §8.1 ("Для коллекций используется единый envelope: data,
  page.nextCursor, page.hasMore")

## Context

Every list-shaped endpoint built across this repository's history — from
Phase 3's original `listCatalogProducts` (public catalog search) through
every admin/customer list endpoint added in the "implementation-completeness"
pass immediately preceding this ADR (categories, products, content, users,
companies, memberships, orders, audit events) — used offset-based pagination
(`limit`/`offset` request parameters) and a `{items, total, limit, offset}`
response envelope. This was never recorded as a deviation anywhere: no ADR,
no `docs/OPEN_QUESTIONS.md` entry, no comment at the point of introduction.

Re-reading TZ §8 while auditing the pagination work against the full API
contract section (not previously cross-checked in detail against this
specific subsection) found the actual requirement: **API-005 mandates
cursor-based pagination**, and §8.1 specifies the exact response shape —
`data` (the items array, not `items`), `page.nextCursor` (an opaque
continuation token), `page.hasMore` (a boolean) — with no `total` field and
no `offset`/`limit` echoed back. This is a real, previously-undetected
specification conflict, not a new product decision: cursor-based pagination
was already normatively required.

Migrating to cursor-based pagination changes the public API contract for
every collection endpoint and removes the `total` count the current UI
displays ("Showing X–Y of Z"). Per CLAUDE.md's change-management rule
("Create an ADR before changing... the public API version"), this requires
this ADR before implementation, not after.

## Decision

Migrate every list endpoint to cursor-based pagination, matching API-005
and §8.1 exactly:

- **Envelope**: `{data: T[], page: {nextCursor?: string, hasMore: boolean}}`
  replaces `{items, total, limit, offset}` everywhere. `total` is dropped —
  not merely hidden — because an exact total is expensive to compute
  correctly under keyset/cursor pagination at the TZ's own named scale (up
  to 100k products, 1M orders) and the spec's own envelope does not name a
  `total` field. UI that previously showed "Showing X–Y of Z" shows a plain
  "Next" continuation instead (see below).
- **Request parameters**: `cursor` (opaque, previously-issued token) and
  `limit` (bounded, safe default — reuses the existing `clampPagination`
  bounds: 1–100, default 20) replace `offset`. `limit` is not named in
  API-005's envelope requirement but is still needed to bound the query
  (DB-005) and is a normal, compatible cursor-API parameter (e.g. Stripe,
  GitHub's REST API).
- **Cursor shape**: opaque, base64url-encoded JSON `{v: <sort field value>,
id: <entity id>}` — never a raw database offset or exposed internal
  structure. `id` is always the tiebreaker so pagination stays stable when
  the sort field has duplicate values (e.g. two companies with the same
  `legalName`, two orders `createdAt` in the same millisecond). Each
  repository's cursor WHERE-clause is built as `(sortField, id) >
(cursor.v, cursor.id)` (or `<` for descending), matching the same
  explicit-allowlist `sort` parameter already built in the preceding
  pagination work — no new sort-field surface, only the pagination
  mechanism underneath it changes.
- **Forward-only**: the spec names only `nextCursor`/`hasMore`, not a
  previous-cursor field. This ADR implements forward-only (`Next`)
  navigation, consistent with what is actually specified — a bidirectional
  cursor (`prevCursor`) is not built here since it is not named in §8.1 and
  would require inventing a shape the TZ does not define. If bidirectional
  admin browsing turns out to be a real product need later, that is a
  follow-up decision, not something to guess into this migration.
- **Scope**: every collection endpoint touched by the preceding
  pagination/search/sort work (categories, products, content, users,
  companies, memberships, orders, audit events) plus the pre-existing
  public `GET /api/catalog/products`. `ProductAssetRepository.listByProduct`
  is unaffected — it was already a deliberate pagination exemption (see the
  roadmap's "media/documents" entry), not a paginated list endpoint.

## Consequences

- **Breaking API change**: every route's query parameters and response
  shape change. Since no external consumer exists yet (pre-launch MVP, no
  versioned public API clients), this does not require API-004's "new major
  API version" escalation — there is no prior version to remain compatible
  with in production. The OpenAPI contract, every admin/customer UI page,
  and every affected unit test are updated in the same pass as the code
  change (not left inconsistent).
- **`PaginationControls`** (`apps/web/src/components/pagination-controls.tsx`)
  is redesigned: no total/offset math, a "Next" action carrying the opaque
  `cursor` query parameter forward (absent when `page.hasMore` is `false`),
  plus a "First page" link back to the uncursored start once the caller has
  scrolled past page one. No `prevCursor`-backed "Previous" (see
  "Forward-only" above) — "First page" is derived entirely from whether the
  current request already carried a `cursor`, never from a server-issued
  previous-page token, so it does not contradict the forward-only envelope.
  The browser back button remains the way to return to an arbitrary earlier
  page.
- `clampPagination` is replaced by `clampLimit` (still 1–100, default 20);
  `offset` is dropped entirely in favor of `cursor`/`decodeCursor`.
- Every repository port's `listAll`/`listByCompany`/`listByEntity`/
  `listPublished` (where paginated) return type changes from
  `Page<T> = {items, total, limit, offset}` to the new
  `CursorPage<T> = {data, page: {nextCursor?, hasMore}}`. This is a
  mechanical, TypeScript-compiler-driven migration; every call site is
  caught by `tsc -b` except runtime-only assertions (the same class of gap
  found and fixed in the immediately preceding pagination work's CI-only
  integration test) — re-verified by grep across every `.test.ts` file, not
  assumed. `ProductRepository.countPublished` is removed outright (no
  `total` exists to compute).
- Does not touch `AuditEventListFilter`/`OrderListFilter`/etc.'s
  `sort`/`status`/`search` fields — those remain exactly as built; only the
  pagination mechanism changes.
- A shared `packages/infrastructure/src/repositories/cursor-query.ts` helper
  (`combineWithCursor`, `buildCursorOrderBy`, `cursorValueOf`) centralizes the
  keyset WHERE/ORDER BY construction so every repository follows the same
  `(sortField, id) > (cursor.v, cursor.id)` pattern instead of reimplementing
  it seven times, and so a filter's own `OR` clause (e.g. product name/SKU
  search) is always combined with the cursor's `OR` via an explicit `AND`,
  never a naive object spread that could silently collide.

## Verification

- `pnpm -r --if-present run typecheck` — 7/7 workspace projects clean.
- `pnpm -r --if-present run test` — 297/297 tests passing across
  `packages/domain`, `packages/application`, `packages/infrastructure`,
  `packages/contracts`, `packages/ui`, `apps/web`, `apps/worker` (local;
  `packages/infrastructure`'s `test:integration` against real PostgreSQL
  runs only in CI, per the standing laptop-lightweight constraint).
- `redocly lint openapi/openapi.yaml` — valid; every collection endpoint's
  request parameters (`cursor`/`limit`, via the new
  `components.parameters.CursorParam`/`LimitParam`) and response envelope
  (`{data, page}`, via `components.schemas.CursorPageInfo`) updated.
