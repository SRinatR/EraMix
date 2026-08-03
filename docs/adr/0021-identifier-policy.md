# ADR-0021: EraMix identifier policy — UUIDv7 internal IDs, random ephemeral IDs, opaque public IDs

- Status: Accepted
- Date: 2026-08-04
- Requirement source: Product Owner instruction, 2026-08-04 ("Implement the
  complete EraMix identifier policy as a dedicated, forward-only, tested
  initiative"), CLAUDE.md ("Public products have immutable, cryptographically
  random `publicId` values... Never expose internal UUIDs as public URLs by
  default"), `docs/IMPLEMENTATION_ROADMAP.md`'s acceptance-readiness pass
  entry ("UUIDv7 internal-ID policy" was previously **N/A** — not yet
  attempted; this ADR is that initiative).

## Context

Before this ADR, every internal PostgreSQL entity `id` column was declared
`String @id @default(uuid()) @db.Uuid` in `packages/infrastructure/prisma/schema.prisma`.
Auditing the actual generation path (not assuming Prisma's schema-level
`@default(uuid())` maps to a database column default — it does not, verified
directly: every `CREATE TABLE` statement in `migrations/20260801170000_init_phase1_schema/migration.sql`
declares these columns `UUID NOT NULL` with **no** `DEFAULT` clause at all)
found two distinct, previously undocumented generation paths coexisting:

1. **Application-supplied**: `packages/application/src/ports.ts`'s
   `IdGenerator.nextId()` — implemented by `packages/infrastructure/src/id-generator.ts`'s
   `CryptoIdGenerator` (`node:crypto`'s `randomUUID()`, a synchronous, purely
   client-side, cryptographically random UUIDv4) — called at exactly 18 sites
   across `packages/application/src/{authoring,order-lifecycle,order-comments,product-assets,uploads}.ts`
   and 4 `apps/web` route handlers (`admin/companies`, `admin/companies/
{companyId}/memberships`, `admin/offers`, `auth/callback`) for every
   aggregate/child row whose `id` a use case needs to know **before** the
   insert — always because that id is also embedded in the same
   transaction's `AuditEvent`/`OutboxMessage` payload, or (translations) as
   the FK linking a nested translation row to its not-yet-persisted parent.
2. **Prisma-client-default**: every repository `create()`/`enqueue()`/
   `record()`/`setCanonicalRoute()` call whose port signature's `Omit<Entity,
...>` **excludes** `'id'` (`AuditEvent.record`, `OutboxMessage.enqueue`,
   `CategoryRoute`/`ContentRoute.setCanonicalRoute`, `OrderLine`'s two create
   paths, `OrderStatusHistory`'s internal creation inside
   `OrderRepository.transitionStatus`, and the seed-only
   `AdvertisingProviderConfig` upsert) never supplies `id` in Prisma's
   `data: {}` object at all — Prisma's query engine silently generates a
   UUIDv4 client-side before constructing the `INSERT`, since the schema
   default is `uuid()`, not a database-native default.

Neither path used PostgreSQL 19 Beta 2's native `uuidv7()` SQL function
(added upstream in PostgreSQL 18, carried forward into 19 Beta 2 — this
project's mandatory database version per ADR-0013). Neither path produced a
time-ordered identifier, which matters for index locality/write amplification
on high-insert-volume tables (`audit_events`, `outbox_messages`,
`order_status_history`) and for natural chronological ordering of the
in-progress unified analytics event registry's `eventId`
(`packages/domain/src/analytics.ts`).

Separately, `packages/domain/src/public-id.ts`'s `Product.publicId` (the
public, opaque, cryptographically random identifier CLAUDE.md requires
instead of exposing the internal UUID) used a fixed 8-character Crockford
Base32 alphabet (`packages/domain/src/opaque-id.ts`) — a 32^8 ≈ 1.1 × 10^12
keyspace, adequate at MVP scale but smaller than ideal for a public-facing
identifier expected to remain stable indefinitely as the catalog grows, with
zero collision-retry handling anywhere in the create path (a raw Prisma
`P2002` unique-constraint violation on `products.publicId` would have
propagated uncaught, an unhandled 500, not a graceful retry).

## Decision

### 1. Internal PostgreSQL entity IDs: PostgreSQL's native `uuidv7()`, always

`packages/infrastructure/prisma/schema.prisma`: every internal UUID `id`
column's `@default(uuid())` becomes `@default(dbgenerated("uuidv7()"))`,
**unconditionally, across all 21 UUID `id` columns in the schema** — both
the "application-supplied" and "Prisma-client-default" paths from the
Context section. This is deliberately uniform rather than split by path:

- For the 8 "Prisma-client-default" models (`CategoryRoute`, `ContentRoute`,
  `OrderLine`, `OrderStatusHistory`, `AuditEvent`, `OutboxMessage`,
  `PlatformSettingsHistory`, `AdvertisingProviderConfig`), this is the entire
  fix: the repository already omits `id` from its Prisma `data: {}` object,
  so once the column has a real database default, PostgreSQL generates a
  genuine, time-ordered UUIDv7 with **no application code change** at all.
- For the 13 "application-supplied" models (`User`, `Company`, `Membership`,
  `Category`, `CategoryTranslation`, `Content`, `ContentTranslation`,
  `Product`, `ProductTranslation`, `ProductAsset`, `Order`, `OrderComment`,
  `Offer`), the application always explicitly supplies `id` in the same
  transaction (needed for the audit/outbox/nested-translation-FK reasons
  above), so the column default is a defense-in-depth safety net — it is
  never actually exercised in normal operation, but guarantees that even a
  future code path that forgets to supply `id` gets a real UUIDv7 from
  PostgreSQL, never an error, a `NULL` constraint violation, or (worse) a
  silently-reintroduced client-side UUIDv4.

For the 13 application-supplied models, `IdGenerator.nextId()`
(`packages/application/src/ports.ts`) is retargeted to source its value from
PostgreSQL directly rather than `node:crypto`: the interface becomes
`nextId(): Promise<string>`, and the sole infrastructure implementation
(`packages/infrastructure/src/id-generator.ts`'s new `PostgresUuidV7IdGenerator`,
replacing the deleted `CryptoIdGenerator`) runs `SELECT uuidv7()::text` via
`packages/infrastructure/src/transaction-context.ts`'s `resolveClient()` —
the same ambient-`AsyncLocalStorage`-transaction-client resolution every
repository adapter already uses, so a call made inside
`UnitOfWork.runInTransaction(...)` transparently joins that transaction
(same connection, same isolation level) exactly like the row it will be used
to insert.

**Explicitly rejected: a hand-rolled/npm-package JavaScript UUIDv7
implementation for this path.** PostgreSQL 19 Beta 2's `uuidv7()` is a
first-class, upstream-tested SQL builtin — introducing a second,
independently-implemented generator for the same identifier class would
mean two potentially-diverging implementations of the same RFC 9562 bit
layout with no way to prove they agree, for no benefit (a database round
trip is already required for every one of these 13 models' inserts, so the
extra `SELECT uuidv7()` adds no new I/O dependency, only one additional
lightweight query per generated id — see "Consequences" for the measured
cost). This is the one deliberate exception to the "no unverified JS UUIDv7"
rule's sibling situation, analytics event ids (decision 2 below), where a
database round trip is not available at generation time.

**No historical UUIDv4 row is rewritten or re-keyed.** A column default only
applies when a value is omitted from an `INSERT`; every existing row's `id`
column value is untouched by this migration, and nothing in this ADR changes
column type, FK relationships, cursor-pagination `ORDER BY`/keyset logic
(`packages/infrastructure/src/repositories/cursor-query.ts` orders by each
model's own business-relevant sort field — `createdAt`, `sortOrder`, etc. —
never by `id`, so UUIDv4/UUIDv7 coexistence in one table has no cursor-
ordering consequence), audit-record shape, outbox-record shape, or
authorization logic. A `SELECT` against a UUIDv4 row and a `SELECT` against a
UUIDv7 row are indistinguishable to every reader in this codebase — both are
just `UUID` values.

### 2. Analytics event `eventId`: UUIDv7, generated client-side (browser)

`packages/domain/src/uuidv7.ts` (new): `generateUuidV7()`/`isValidUuidV7()`,
a small, self-contained, RFC-9562-compliant implementation using only
Web-Crypto `crypto.getRandomValues` (the same zero-platform-dependency
convention `packages/domain/src/opaque-id.ts` already established for
`publicId`/`orderNumber`) — 48 bits of big-endian Unix-millisecond timestamp,
the fixed version nibble (`0111`) and variant bits (`10`), and the remaining
bits cryptographically random.

This is the one place a hand-written UUIDv7 generator is the correct choice,
not a compromise: `packages/application/src/analytics.ts`'s
`recordAnalyticsEvents` is called from `POST /api/analytics/events`, a
public, unauthenticated, anonymous endpoint whose payload originates in the
visitor's **browser** (`apps/web/src/components/analytics-client.ts`) before
any request — let alone a database transaction — exists. There is no
PostgreSQL connection available to the browser, so decision 1's "the
database is authoritative" reasoning does not apply here; the alternative
would be blocking every analytics event on a round trip to the server merely
to mint an id before the event itself is even sent, which defeats the
fire-and-forget, non-blocking delivery guarantee CLAUDE.md requires for
analytics. `generateUuidV7()` replaces `analytics-client.ts`'s previous
`crypto.randomUUID()` (UUIDv4) call; `packages/domain/src/analytics.ts`'s
`validateAnalyticsEvent` now requires `isValidUuidV7(event.eventId)` (previously
only a non-empty-string check), and `apps/web/src/server/analytics-event-schema.ts`'s
zod schema gains a matching `.refine(isValidUuidV7, ...)` at the delivery
boundary — both a malformed string and a syntactically-valid-but-wrong-
version UUID (e.g. a UUIDv4) are now rejected as `422 VALIDATION_FAILED`.

Event identity is never derived from PII, URL text, browser fingerprint,
account id, or campaign data — `eventId` is pure randomness plus a
timestamp, exactly like every other UUIDv7 in this codebase. UUIDv7
ordering is a genuine ingestion/debugging/storage-ordering benefit (per
CLAUDE.md's own instruction) and ordering already existed implicitly via
`occurredAt`; this only makes the _id itself_ sortable too, which helps a
future Rust-analytics/GA4/Yandex ingestion pipeline's own storage layer.
Idempotent sink behavior is unchanged by this decision: `eventId` was always
the dedup key (`AnalyticsEventLike.eventId`,
`packages/application/src/ports.ts`); this ADR only changes its _format_,
never its role.

### 3. Ephemeral and security-sensitive IDs: unchanged, still random UUIDv4/opaque tokens

The following remain exactly as they are today — cryptographically random,
version-4 UUIDs or independently-random opaque strings, generated fresh at
use time, **never** migrated to UUIDv7:

| Value                                                                                         | Generator                                                                                                                                         | Why UUIDv7 is wrong here                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order/form submission Idempotency-Key                                                         | client-supplied (`crypto.randomUUID()` in `SubmitOrderButton`)                                                                                    | Ordering provides no benefit — the key exists purely as an opaque dedup token for one specific retried request, never queried by range or sorted.                                                                                                                                                                                                                                                                           |
| W3C trace/correlation id (`apps/web/src/server/trace.ts`)                                     | `randomUUID().replaceAll('-', '')`                                                                                                                | A trace id is a correlation value for an external tracing system (W3C Trace Context), not a database entity identifier — embedding a creation timestamp in it would be redundant (traces already carry their own timestamps) and would leak request-arrival time to anything that can read a trace id out of a log line.                                                                                                    |
| Browser anonymous analytics `sessionId` (`analytics-client.ts`'s `getSessionId`)              | `crypto.randomUUID()`, `sessionStorage`-scoped                                                                                                    | Deliberately **not** time-ordered or persistent across sessions — CLAUDE.md requires this to stay a short-lived, non-tracking identifier; a UUIDv7's embedded timestamp would let any two events from the same tab be correlated to an exact session-start time window even after the id itself is otherwise anonymous, a privacy regression with no offsetting benefit (session ordering already comes from `occurredAt`). |
| Fake OIDC authorization codes (`scripts/pi/oidc-fake-idp.mjs`, test-only)                     | `randomUUID()`-equivalent                                                                                                                         | Single-use, short-lived, security-sensitive — must remain unpredictable with no structure an attacker could exploit; also test/fixture-only, never a production identifier.                                                                                                                                                                                                                                                 |
| Reset/recovery/verification tokens                                                            | (not yet implemented — no such flow exists in this codebase today; recorded here so a future implementation does not reach for UUIDv7 by default) | Same reasoning as Idempotency-Key/session id: a security token must never leak its approximate issuance time to whoever holds it, and ordering has no legitimate use for a single-use secret.                                                                                                                                                                                                                               |
| Test-fixture-only random ids (`scripts/pi/seed-e2e.ts` fixture users, in-memory test doubles) | `randomUUID()`/sequential test counters                                                                                                           | Not a production identifier at all; changing these would add churn to test fixtures for zero production benefit.                                                                                                                                                                                                                                                                                                            |

The shared rationale, stated once rather than repeated per row: **UUIDv7
trades unpredictability for sortability by embedding a real timestamp in the
identifier's first 48 bits.** That trade is correct for a database primary
key (decision 1) and acceptable for a client-generated, already-timestamped
analytics event id (decision 2), but is a strict privacy/security regression
for anything whose entire purpose is to be a short-lived, minimally-
informative, unpredictable token — exposing "when was this token minted" is
exactly the kind of side-channel a security-sensitive ephemeral value must
not carry. None of the values in this table are logged in cleartext anywhere
in this codebase (grepped before writing this ADR); this decision does not
change that.

### 4. Public product identifiers: 16-character Crockford Base32, legacy 8-character compatibility preserved forever

`packages/domain/src/public-id.ts`: `generatePublicId()` now generates a
**16-character** opaque Crockford Base32 identifier (32^16 ≈ 1.2 × 10^24
keyspace) using the same `packages/domain/src/opaque-id.ts` alphabet/
Web-Crypto mechanism as before — only the length constant changes.
`PUBLIC_ID_LENGTH` is now `16`; a new `LEGACY_PUBLIC_ID_LENGTH = 8` constant
documents the historical format. `isValidPublicId()` accepts **either**
length, exactly — never a range, never prefix matching. `splitCatalogSlug()`
(shared by `apps/web/src/proxy.ts` and the catalog page, per ADR-0018's own
reuse convention) checks the 16-character boundary first, then the
8-character boundary; this ordering is provably unambiguous, not merely
convenient, because the separator character (`-`) is never itself a member
of the Crockford alphabet — a genuine legacy 8-character id followed by a
`-` and a slug can never also satisfy the 16-character check, because
position 8 of any such string is the literal `-` separator, which
immediately fails the 16-character alphabet-membership test. No prefix
matching, no length range, no heuristic is used anywhere in this parsing
path.

**Every product `publicId` value persisted before this ADR remains valid
and canonical forever.** `Product.publicId` is `@db.VarChar(32)` (unchanged;
comfortably holds both 8 and 16 characters, so no migration is needed for
this decision), and nothing rewrites, reissues, or deprecates an existing
8-character id — `/{locale}/catalog/{publicId}-{localizedSlug}` resolves a
legacy product exactly as it always has (`ProductRepository.findByPublicId`
is a plain equality lookup against whatever string is stored; length is
irrelevant to it). Only **newly created** products receive a 16-character
id. A future decision to stop accepting the legacy 8-character format
entirely (e.g. once no reachable UI or external integration ever
constructs one) requires its own ADR update — this one does not set a
removal date, since every existing legacy id must keep resolving
indefinitely per CLAUDE.md's redirect/canonical-URL stability rules.

**Bounded collision retry with telemetry** (`packages/application/src/authoring.ts`'s
`createProduct`): a new `PublicIdConflictError` (`packages/domain/src/errors.ts`,
mapped to `409 PUBLIC_ID_CONFLICT` in `packages/contracts/src/error-catalogue.ts`)
is thrown by `PrismaProductRepository.create()` when — and only when — the
Prisma `P2002` unique-constraint-violation's `meta.target` names the
`publicId` column specifically (disambiguated from a `sku` or translation-
locale conflict, which still map to the existing `SlugConflictError`).
`createProduct` retries the **entire** transaction (a fresh `publicId`, a
fresh `productId`/translation ids from `IdGenerator`, decision 1) up to 5
times, recording a `product.public_id_collision` audit event (the
"telemetry" this decision requires — reusing the existing
`AuditEventRepository`, this codebase's established observability
mechanism, rather than introducing a new logging port) before each retry.
Exhausting all 5 attempts propagates `PublicIdConflictError` as a genuine
`409` — at a 32^16 keyspace this is astronomically unreachable in practice
(collision probability at even 10^9 total products is on the order of
10^-6), so a real 409 here would itself indicate a systemic RNG/entropy
fault worth surfacing loudly, not an error to hide behind a generic 500. A
collision **never** overwrites an existing product or resolves a URL to the
wrong product: the retry happens entirely before any row is returned to the
caller, and the unique constraint itself is PostgreSQL's own guarantee, not
an application-level check that could race.

### 5. Other public identifiers: audited, no change required

`Order.orderNumber` (`packages/domain/src/order-number.ts`) already follows
this exact policy — a short, opaque, cryptographically random
(`ORD-` + 10-character Crockford Base32) identifier, entirely independent of
the internal UUID `id`, never exposing creation time, sequence, or customer
data. Its keyspace (32^10 ≈ 1.1 × 10^15) and lack of collision-retry handling
mirror the product `publicId`'s pre-this-ADR state; this ADR does not add
retry logic there, since the Product Owner instruction scoped explicit
collision-retry work to product `publicId` specifically. This is recorded
as a deliberate, honestly-scoped omission, not an oversight: extending the
same retry pattern to `Order.orderNumber` would be a natural, low-risk
follow-up, tracked here rather than done as an unrequested drive-by change.

Grepped every other identifier reachable from a public URL, the admin UI,
downloads, exports, emails, OpenAPI examples, and external integrations
(`ProductAsset.storageKey`, `PlatformSettings`/`AdvertisingProviderConfig`
admin-only rows, `AuditEvent`/`OutboxMessage` internal ids): none of them
are exposed as a public route segment or an external reference today.
`ProductAsset.storageKey` is embedded in a server-side HMAC-signed download
URL (never a raw public object URL — `docs/runbooks/security.md`) and is
sourced from the same `IdGenerator` as every other application-supplied id
(decision 1); it is an internal storage-path segment, not a public-facing
identity column, so decision 1's UUIDv7 policy — not decision 4's opaque
public-ID policy — correctly governs it.

### 6. Prisma/database generation boundary

- **Database-generated** (`@default(dbgenerated("uuidv7()"))`, PostgreSQL
  19 Beta 2's native `uuidv7()`): the value materializes only when a
  repository's Prisma `data: {}` object omits `id` — true today for
  `CategoryRoute`, `ContentRoute`, `OrderLine`, `OrderStatusHistory`,
  `AuditEvent`, `OutboxMessage`, `PlatformSettingsHistory`,
  `AdvertisingProviderConfig`, and as a defense-in-depth fallback for every
  other UUID `id` column.
- **Application-obtained-from-database** (`IdGenerator.nextId()` →
  `PostgresUuidV7IdGenerator` → `SELECT uuidv7()::text`): the value is fetched
  from PostgreSQL explicitly, before the row exists, whenever a use case
  needs to reference the id in the same transaction's audit/outbox/nested-FK
  payload — `User`, `Company`, `Membership`, `Category`,
  `CategoryTranslation`, `Content`, `ContentTranslation`, `Product`,
  `ProductTranslation`, `ProductAsset`, `Order`, `OrderComment`, `Offer`.
- **Client-generated, never database-backed**: `packages/domain/src/uuidv7.ts`
  (analytics `eventId` only) and every value in decision 3's table.

## Verification and rollback strategy

- **Migration**: `20260804120000_add_uuidv7_defaults` (generated fully
  offline via `prisma migrate diff --from-schema <the previous committed
schema.prisma> --to-schema <the new schema.prisma> --script`, the same
  method as every prior incremental migration in this repository) alters
  only column defaults — `ALTER TABLE ... ALTER COLUMN "id" SET DEFAULT
uuidv7()` for all 21 UUID `id` columns. No column type change, no data
  rewrite, no new/dropped constraint. Rollback is a single follow-up
  migration re-issuing `ALTER COLUMN "id" DROP DEFAULT` (or restoring
  `gen_random_uuid()`/client-side generation) if `uuidv7()` were ever found
  unavailable in a target PostgreSQL build — the migration is additive and
  reversible with no data loss in either direction.
- **CI's `db-migration` job** (real `postgres:19beta2-alpine` service,
  `docs/runbooks/http-error-contract.md`'s standing convention for every
  Postgres-backed behavior in this repository) is the authoritative
  verification environment, since this laptop has no local PostgreSQL:
  migrations apply from empty and from the prior schema; a new integration
  test asserts `SELECT uuid_extract_version(id) = 7` for a freshly inserted
  row across a representative sample of both "database-generated" and
  "application-obtained" models, that FK inserts referencing a UUIDv7 parent
  succeed identically to a UUIDv4 parent, that the pre-existing seed data's
  UUIDv4 rows remain fully readable and correctly joined, and that audit/
  outbox atomicity (a state change and its audit/outbox rows commit or roll
  back together) is unaffected.
- Product `publicId` length/collision-retry is verified with domain-level
  unit tests (generation length/alphabet, dual-length validation, legacy/new
  `splitCatalogSlug` disambiguation) and a real-Postgres integration test
  forcing a `publicId` collision (two `create()` calls with the same
  `publicId` value) to prove the second is rejected as `PublicIdConflictError`,
  never silently accepted or resolved to the first product's data.
- Analytics `eventId` UUIDv7 format is verified with domain unit tests
  (`generateUuidV7`/`isValidUuidV7`) and a zod-schema rejection test for a
  syntactically-valid UUIDv4 supplied where a UUIDv7 is required.

## Consequences

- Every one of the 13 "application-supplied" models now costs one extra
  `SELECT uuidv7()` round trip per generated id (previously a free,
  synchronous, in-process `randomUUID()` call). Each of these ids is
  generated immediately before a repository `.create()`/`.enqueue()` call
  that itself requires a database round trip in the same transaction, so
  this adds one additional lightweight query per transaction, not a new
  network dependency — accepted as the cost of PostgreSQL being the sole
  authoritative UUIDv7 source (see decision 1's rejection of a JS
  implementation). `IdGenerator.nextId()` becoming `Promise<string>` is a
  breaking port-signature change; every one of the 18 call sites and every
  test double implementing this port in this repository is updated in the
  same change (tracked in the accompanying roadmap entry, not left
  partially migrated).
- `CryptoIdGenerator` is deleted outright (not deprecated in place) since
  nothing referenced it outside its own module, `packages/infrastructure/src/index.ts`'s
  export, and the one production wiring site (`apps/web/src/server/container.ts`)
  this change already updates.
- No public API/URL shape changes: `/{locale}/catalog/{publicId}-{slug}`
  is unchanged; only the `publicId` segment's possible lengths grow from
  "exactly 8" to "exactly 8 or exactly 16," both already handled by the
  existing `isValidPublicId`/`splitCatalogSlug` call sites with no caller
  changes needed (verified: neither `packages/application/src/route-resolution.ts`,
  `apps/web/src/app/[locale]/catalog/[slug]/page.tsx`, nor `apps/web/src/proxy.ts`
  perform their own length arithmetic against the `PUBLIC_ID_LENGTH`
  constant — all three delegate entirely to `public-id.ts`'s functions).
- `docs/IMPLEMENTATION_ROADMAP.md`, `docs/runbooks/http-error-contract.md`
  (new `PUBLIC_ID_CONFLICT`/409 row), and `packages/contracts/openapi/openapi.yaml`
  (new error code in `ProblemDetails.code`'s enum, updated `publicId`
  schema description) are updated in the same initiative, not left to drift.
