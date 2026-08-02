import type {
  AuditEvent,
  Category,
  CategoryRoute,
  CategoryTranslation,
  Company,
  Content,
  ContentRoute,
  ContentRouteNamespace,
  ContentTranslation,
  IndicativePrice,
  LocaleCode,
  Membership,
  Order,
  OrderComment,
  OrderLine,
  OrderStatus,
  OrderStatusHistoryEntry,
  OutboxMessage,
  PlatformRole,
  PlatformSettings,
  PlatformSettingsHistoryEntry,
  Product,
  ProductAsset,
  ProductTranslation,
  PublicationStatus,
  User,
} from '@eramix/domain';
import type { CursorPage, CursorPaginationInput } from './pagination.js';

/**
 * Every `update*` method enforces optimistic concurrency: the caller passes
 * the version it last read, and the adapter throws
 * `ConcurrencyConflictError` (packages/domain) when zero rows match
 * `WHERE id = $1 AND version = $2` — the aggregate changed underneath it.
 *
 * These ports intentionally expose only the persistence operations Phase 1
 * needs (create/read/update-with-OCC and the unique lookups their canonical
 * URL / business-key resolution depends on); use-case-shaped methods
 * (submit order, publish content, ...) belong to later phases.
 */

export interface UserListFilter {
  readonly search?: string;
  readonly sort?: 'createdAt_asc' | 'createdAt_desc' | 'displayName_asc' | 'displayName_desc';
}

export interface UserRepository {
  findById(id: string): Promise<User | undefined>;
  findByIssuerAndSubject(issuer: string, subject: string): Promise<User | undefined>;
  create(input: Omit<User, 'version' | 'createdAt' | 'updatedAt'>): Promise<User>;
  /** Admin `users.manage` listing (ADM-002/DB-005: bounded, paginated, filterable, sortable). */
  listAll(input?: CursorPaginationInput & UserListFilter): Promise<CursorPage<User>>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updatePlatformRole(
    id: string,
    expectedVersion: number,
    platformRole: PlatformRole,
  ): Promise<User>;
}

export interface CompanyListFilter {
  readonly search?: string;
  readonly sort?: 'createdAt_asc' | 'createdAt_desc' | 'legalName_asc' | 'legalName_desc';
}

export interface CompanyRepository {
  findById(id: string): Promise<Company | undefined>;
  create(input: Omit<Company, 'version' | 'createdAt' | 'updatedAt'>): Promise<Company>;
  /** Admin `users.manage` listing (TZ's Identity & Access module owns company data; ADM-002/DB-005: bounded, paginated, filterable, sortable). */
  listAll(input?: CursorPaginationInput & CompanyListFilter): Promise<CursorPage<Company>>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateStatus(id: string, expectedVersion: number, status: Company['status']): Promise<Company>;
}

export interface MembershipListFilter {
  readonly sort?: 'createdAt_asc' | 'createdAt_desc';
}

export interface MembershipRepository {
  findById(id: string): Promise<Membership | undefined>;
  findByUserAndCompany(userId: string, companyId: string): Promise<Membership | undefined>;
  listByUser(userId: string): Promise<readonly Membership[]>;
  /** ADM-002/DB-005: bounded, paginated, sortable. */
  listByCompany(
    companyId: string,
    input?: CursorPaginationInput & MembershipListFilter,
  ): Promise<CursorPage<Membership>>;
  create(input: Omit<Membership, 'version' | 'createdAt' | 'updatedAt'>): Promise<Membership>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateStatus(
    id: string,
    expectedVersion: number,
    status: Membership['status'],
  ): Promise<Membership>;
}

export interface CategoryWithTranslations extends Category {
  readonly translations: readonly (CategoryTranslation & {
    readonly routes: readonly CategoryRoute[];
  })[];
}

/**
 * Editable-only fields for an existing translation (never `slug` — slug
 * changes are the separate, explicitly audited slug-change.ts command;
 * CLAUDE.md: "title edits must never silently change slugs"). `undefined`
 * means "leave this field unchanged"; `null` on a nullable field means
 * "clear it" — the same tri-state idiom as ProductAssetMetadataPatch.
 */
export interface CategoryTranslationEditPatch {
  readonly name?: string;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
}

export interface CategoryListFilter {
  /** Substring match against any locale's translation name — explicit allowlist, never a raw query passthrough. */
  readonly search?: string;
  readonly status?: Category['status'];
  readonly sort?: 'sortOrder_asc' | 'sortOrder_desc' | 'createdAt_asc' | 'createdAt_desc';
}

export interface CategoryRepository {
  findById(id: string): Promise<CategoryWithTranslations | undefined>;
  findByCanonicalSlug(
    locale: LocaleCode,
    slug: string,
  ): Promise<CategoryWithTranslations | undefined>;
  /** Returns the route regardless of canonical status — the raw building block route resolution needs. */
  findRouteBySlug(locale: LocaleCode, slug: string): Promise<CategoryRoute | undefined>;
  findCanonicalRouteByTranslationId(translationId: string): Promise<CategoryRoute | undefined>;
  create(
    category: Omit<Category, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<CategoryTranslation, 'version' | 'createdAt' | 'updatedAt'>[],
  ): Promise<CategoryWithTranslations>;
  /** Adds a translation to an existing category. Throws SlugConflictError if the (categoryId, locale) pair already exists. */
  addTranslation(
    categoryId: string,
    translation: Omit<CategoryTranslation, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<CategoryWithTranslations>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion, ResourceNotFoundError if translationId doesn't belong to categoryId. */
  updateTranslation(
    categoryId: string,
    translationId: string,
    expectedVersion: number,
    patch: CategoryTranslationEditPatch,
  ): Promise<CategoryWithTranslations>;
  setCanonicalRoute(
    route: Omit<CategoryRoute, 'id' | 'createdAt' | 'isCanonical'>,
  ): Promise<CategoryRoute>;
  /** PUBLISHED categories only — catalog browse and sitemap generation. */
  listPublished(): Promise<readonly CategoryWithTranslations[]>;
  listByParent(parentId: string | undefined): Promise<readonly CategoryWithTranslations[]>;
  /** All statuses (DRAFT/PUBLISHED/ARCHIVED) — admin catalog listing (ADM-002/DB-005: bounded, paginated, filterable, sortable). */
  listAll(
    input?: CursorPaginationInput & CategoryListFilter,
  ): Promise<CursorPage<CategoryWithTranslations>>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateStatus(
    id: string,
    expectedVersion: number,
    status: Category['status'],
  ): Promise<CategoryWithTranslations>;
}

export interface ProductWithTranslations extends Product {
  readonly translations: readonly ProductTranslation[];
}

/** See CategoryTranslationEditPatch's tri-state doc comment — same idiom. Never `slug` (slug-change.ts owns that). `indicativePrice: null` clears the price entirely; an object replaces it wholesale (already validated by the caller via createIndicativePrice). */
export interface ProductTranslationEditPatch {
  readonly name?: string;
  readonly description?: string | null;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly indicativePrice?: IndicativePrice | null;
}

export interface ProductListFilter {
  readonly categoryId?: string;
  /** Substring match against SKU or any locale's translation name — explicit allowlist, never a raw query passthrough. */
  readonly search?: string;
  readonly status?: Product['status'];
  readonly sort?: 'createdAt_asc' | 'createdAt_desc' | 'sku_asc' | 'sku_desc';
}

export interface ProductRepository {
  findById(id: string): Promise<ProductWithTranslations | undefined>;
  findByPublicId(publicId: string): Promise<ProductWithTranslations | undefined>;
  findBySku(sku: string): Promise<ProductWithTranslations | undefined>;
  create(
    product: Omit<Product, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<ProductTranslation, 'version' | 'createdAt' | 'updatedAt'>[],
  ): Promise<ProductWithTranslations>;
  /** Adds a translation to an existing product. Throws SlugConflictError if the (productId, locale) pair already exists. */
  addTranslation(
    productId: string,
    translation: Omit<ProductTranslation, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProductWithTranslations>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion, ResourceNotFoundError if translationId doesn't belong to productId. */
  updateTranslation(
    productId: string,
    translationId: string,
    expectedVersion: number,
    patch: ProductTranslationEditPatch,
  ): Promise<ProductWithTranslations>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateStatus(
    id: string,
    expectedVersion: number,
    status: Product['status'],
  ): Promise<ProductWithTranslations>;
  /** PUBLISHED products only, optionally scoped to a category — catalog browse/search and sitemap generation (ADR-0017: cursor-paginated). */
  listPublished(
    input: { categoryId?: string; search?: string } & CursorPaginationInput,
  ): Promise<CursorPage<ProductWithTranslations>>;
  /** All statuses (DRAFT/PUBLISHED/ARCHIVED) — admin catalog listing (ADM-002/DB-005: bounded, paginated, filterable, sortable). */
  listAll(
    input?: CursorPaginationInput & ProductListFilter,
  ): Promise<CursorPage<ProductWithTranslations>>;
}

/** Patch shape for editing an existing asset's editorial metadata (never storageKey/checksum/scan fields — those are set once at upload time and are otherwise immutable). */
export interface ProductAssetMetadataPatch {
  readonly displayName?: string;
  readonly altText?: string | null;
  readonly caption?: string | null;
  readonly locale?: LocaleCode | null;
  readonly sortOrder?: number;
}

export interface ProductAssetRepository {
  findById(id: string): Promise<ProductAsset | undefined>;
  /** All statuses — admin management view for one product, ordered by sortOrder. */
  listByProduct(productId: string): Promise<readonly ProductAsset[]>;
  /** PUBLISHED only — public product page rendering, ordered by sortOrder. */
  listPublishedByProduct(productId: string): Promise<readonly ProductAsset[]>;
  create(asset: Omit<ProductAsset, 'version' | 'createdAt' | 'updatedAt'>): Promise<ProductAsset>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateMetadata(
    id: string,
    expectedVersion: number,
    patch: ProductAssetMetadataPatch,
  ): Promise<ProductAsset>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateStatus(
    id: string,
    expectedVersion: number,
    status: PublicationStatus,
  ): Promise<ProductAsset>;
  /** Hard delete — the caller is responsible for also deleting the underlying storage object first. */
  delete(id: string): Promise<void>;
}

export interface ContentWithTranslations extends Content {
  readonly translations: readonly (ContentTranslation & {
    readonly routes: readonly ContentRoute[];
  })[];
}

/** See CategoryTranslationEditPatch's tri-state doc comment — same idiom. Never `slug` (slug-change.ts owns that, and only ARTICLE/PAGE have one). `content` (the JSON body) is never nullable at the DB layer, so it has no clear-to-null state — omit it to leave the body unchanged, or supply a full replacement. */
export interface ContentTranslationEditPatch {
  readonly title?: string;
  readonly summary?: string | null;
  readonly content?: unknown;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
}

export interface ContentListFilter {
  readonly type?: Content['type'];
  readonly status?: Content['status'];
  /** Substring match against any locale's translation title — explicit allowlist, never a raw query passthrough. */
  readonly search?: string;
  readonly sort?: 'createdAt_asc' | 'createdAt_desc';
}

export interface ContentRepository {
  findById(id: string): Promise<ContentWithTranslations | undefined>;
  /** Route uniqueness — and therefore lookup — is scoped per (namespace, locale). */
  findByCanonicalSlug(
    namespace: ContentRouteNamespace,
    locale: LocaleCode,
    slug: string,
  ): Promise<ContentWithTranslations | undefined>;
  /** Returns the route regardless of canonical status — the raw building block route resolution needs. */
  findRouteBySlug(
    namespace: ContentRouteNamespace,
    locale: LocaleCode,
    slug: string,
  ): Promise<ContentRoute | undefined>;
  findCanonicalRouteByTranslationId(translationId: string): Promise<ContentRoute | undefined>;
  create(
    content: Omit<Content, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<ContentTranslation, 'version' | 'createdAt' | 'updatedAt'>[],
  ): Promise<ContentWithTranslations>;
  /** Adds a translation to an existing content item. Throws SlugConflictError if the (contentId, locale) pair already exists. */
  addTranslation(
    contentId: string,
    translation: Omit<ContentTranslation, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<ContentWithTranslations>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion, ResourceNotFoundError if translationId doesn't belong to contentId. */
  updateTranslation(
    contentId: string,
    translationId: string,
    expectedVersion: number,
    patch: ContentTranslationEditPatch,
  ): Promise<ContentWithTranslations>;
  /**
   * Creates a new canonical route for a translation, demoting any previous
   * canonical route for the same translation first (the partial unique
   * index allows only one `isCanonical = true` row per translation). Full
   * slug-change/redirect/history semantics are Phase 2; this is the minimal
   * Phase 1 operation the canonical-route constraint needs to be exercised.
   */
  setCanonicalRoute(
    route: Omit<ContentRoute, 'id' | 'createdAt' | 'isCanonical'>,
  ): Promise<ContentRoute>;
  /** PUBLISHED content only, scoped to a type — public listing (e.g. FAQ, article index) and sitemap generation. */
  listPublished(type: Content['type']): Promise<readonly ContentWithTranslations[]>;
  /** All statuses (DRAFT/PUBLISHED/ARCHIVED), all types — admin content listing (ADM-002/DB-005: bounded, paginated, filterable, sortable). */
  listAll(
    input?: CursorPaginationInput & ContentListFilter,
  ): Promise<CursorPage<ContentWithTranslations>>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateStatus(
    id: string,
    expectedVersion: number,
    status: Content['status'],
  ): Promise<ContentWithTranslations>;
}

export interface OrderWithLines extends Order {
  readonly lines: readonly OrderLine[];
  readonly statusHistory: readonly OrderStatusHistoryEntry[];
}

export interface OrderListFilter {
  readonly status?: OrderStatus;
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
  readonly sort?: 'createdAt_asc' | 'createdAt_desc';
  /** Substring match against the public orderNumber — explicit allowlist for `sort`, but this is a search value, never a raw query passthrough. */
  readonly search?: string;
  /**
   * Restricts to a `WHERE companyId IN (...)` set in a single query — the
   * multi-company customer order list's true cross-company page (one
   * ORDER BY + LIMIT + OFFSET + COUNT over every company the actor
   * belongs to), never a per-company fan-out merged in memory. Admin
   * `listAll` omits this (sees every company); the customer-facing caller
   * always passes the actor's live `ACTIVE` membership company ids.
   */
  readonly companyIds?: readonly string[];
}

export interface OrderRepository {
  findById(id: string): Promise<OrderWithLines | undefined>;
  findByOrderNumber(orderNumber: string): Promise<OrderWithLines | undefined>;
  findByIdempotencyKey(idempotencyKey: string): Promise<OrderWithLines | undefined>;
  /** ACC-003 ("фильтр по статусу/дате, сортировку, пагинацию") / ADM-002 / DB-005: bounded, paginated, filterable, sortable. */
  listByCompany(
    companyId: string,
    input?: CursorPaginationInput & OrderListFilter,
  ): Promise<CursorPage<OrderWithLines>>;
  /** Manager/admin queue (`order.read.all`), or — when `companyIds` is set — a true cross-company customer view. Same ACC-003/ADM-002/DB-005 pagination/filter/sort contract. */
  listAll(input?: CursorPaginationInput & OrderListFilter): Promise<CursorPage<OrderWithLines>>;
  create(
    order: Omit<Order, 'version' | 'createdAt' | 'updatedAt'>,
    lines: readonly Omit<OrderLine, 'id'>[],
  ): Promise<OrderWithLines>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. DRAFT-only line mutation (ORD-006). */
  addLine(
    orderId: string,
    expectedVersion: number,
    line: Omit<OrderLine, 'id' | 'orderId'>,
  ): Promise<OrderWithLines>;
  removeLine(orderId: string, expectedVersion: number, lineId: string): Promise<OrderWithLines>;
  /**
   * Appends an OrderStatusHistory row and updates `status` (plus optionally
   * `idempotencyKey`/`submittedAt` for the DRAFT->SUBMITTED transition)
   * atomically. Throws ConcurrencyConflictError on a stale expectedVersion.
   */
  transitionStatus(
    orderId: string,
    expectedVersion: number,
    input: {
      readonly toStatus: OrderStatus;
      readonly actorUserId?: string;
      readonly reason?: string;
      readonly idempotencyKey?: string;
      readonly submittedAt?: Date;
    },
  ): Promise<OrderWithLines>;
}

export interface OrderCommentRepository {
  /** Append-only, ordered oldest-first — same convention as OrderStatusHistory. Visibility filtering is the use case's job, not the repository's. */
  listByOrder(orderId: string): Promise<readonly OrderComment[]>;
  create(comment: Omit<OrderComment, 'createdAt'>): Promise<OrderComment>;
}

export interface AuditEventListFilter {
  readonly action?: string;
  readonly actorUserId?: string;
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
  readonly sort?: 'createdAt_asc' | 'createdAt_desc';
}

export interface AuditEventRepository {
  record(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<AuditEvent>;
  /** ADM-002/DB-005: entity-scoped audit search — a hot entity's audit trail grows unbounded over time, so this is bounded and paginated like every other list endpoint, filterable by action/actor/date, sortable. */
  listByEntity(
    entityType: string,
    entityId: string,
    input?: CursorPaginationInput & AuditEventListFilter,
  ): Promise<CursorPage<AuditEvent>>;
}

export interface OutboxMessageRepository {
  /** Enqueues within the caller's transaction — see UnitOfWork; this is how
   * "state change + outbox row" atomicity (CLAUDE.md) is achieved. */
  enqueue(
    message: Omit<OutboxMessage, 'id' | 'status' | 'attempts' | 'availableAt' | 'lastError'>,
  ): Promise<OutboxMessage>;
  claimPending(limit: number): Promise<readonly OutboxMessage[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string, nextAvailableAt: Date): Promise<void>;
  /** Terminal failure after exhausting retries — never retried again automatically. */
  markDeadLetter(id: string, error: string): Promise<void>;
}

/**
 * Tri-state field patch (same idiom as CategoryTranslationEditPatch/
 * ProductAssetMetadataPatch): a field omitted from the patch is left
 * unchanged; an optional field set to `null` is cleared; any other value
 * replaces the current one. Required (non-nullable) fields never accept
 * `null`. `id`/`createdAt`/`updatedAt`/`version`/`updatedByUserId` are never
 * patchable directly — `updatedByUserId` is always the caller's own actor id.
 */
export type PlatformSettingsPatch = Partial<
  Pick<
    PlatformSettings,
    | 'canonicalHost'
    | 'forceHttps'
    | 'stripTrailingSlash'
    | 'crawlerGlobalNoindex'
    | 'googleExtendedAllowed'
    | 'aiCompatibilityFilesEnabled'
    | 'analyticsConsentRequired'
    | 'ga4Enabled'
    | 'yandexMetricaEnabled'
    | 'rustAnalyticsEnabled'
    | 'indexNowEnabled'
    | 'merchantCenterEnabled'
  >
> & {
  readonly organizationName?: string | null;
  readonly organizationLegalName?: string | null;
  readonly organizationEmail?: string | null;
  readonly organizationPhone?: string | null;
  readonly organizationAddress?: string | null;
  readonly organizationSameAs?: readonly string[] | null;
  readonly seoDefaultTitleTemplate?: string | null;
  readonly seoDefaultDescriptionFallback?: string | null;
  readonly ogFallbackImageUrl?: string | null;
  readonly ga4MeasurementId?: string | null;
  readonly yandexMetricaCounterId?: string | null;
  readonly searchConsoleVerificationToken?: string | null;
  readonly yandexWebmasterVerificationToken?: string | null;
  readonly bingVerificationToken?: string | null;
};

export interface PlatformSettingsRepository {
  /** Throws ResourceNotFoundError if the singleton row is missing (created only by prisma/seed.ts — never implicitly materialized on read). */
  get(): Promise<PlatformSettings>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  update(
    expectedVersion: number,
    patch: PlatformSettingsPatch,
    updatedByUserId: string | undefined,
  ): Promise<PlatformSettings>;
}

export interface PlatformSettingsHistoryRepository {
  record(
    entry: Omit<PlatformSettingsHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<PlatformSettingsHistoryEntry>;
  /** Newest first — ADM-002/DB-005: bounded, paginated. */
  list(input?: CursorPaginationInput): Promise<CursorPage<PlatformSettingsHistoryEntry>>;
}
