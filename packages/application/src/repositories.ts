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
  LocaleCode,
  Membership,
  Order,
  OrderLine,
  OrderStatusHistoryEntry,
  OutboxMessage,
  Product,
  ProductTranslation,
  User,
} from '@eramix/domain';

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

export interface UserRepository {
  findById(id: string): Promise<User | undefined>;
  findByIssuerAndSubject(issuer: string, subject: string): Promise<User | undefined>;
  create(input: Omit<User, 'version' | 'createdAt' | 'updatedAt'>): Promise<User>;
}

export interface CompanyRepository {
  findById(id: string): Promise<Company | undefined>;
  create(input: Omit<Company, 'version' | 'createdAt' | 'updatedAt'>): Promise<Company>;
}

export interface MembershipRepository {
  findByUserAndCompany(userId: string, companyId: string): Promise<Membership | undefined>;
  listByUser(userId: string): Promise<readonly Membership[]>;
  create(input: Omit<Membership, 'version' | 'createdAt' | 'updatedAt'>): Promise<Membership>;
}

export interface CategoryWithTranslations extends Category {
  readonly translations: readonly (CategoryTranslation & {
    readonly routes: readonly CategoryRoute[];
  })[];
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
    translations: readonly Omit<CategoryTranslation, 'createdAt' | 'updatedAt'>[],
  ): Promise<CategoryWithTranslations>;
  setCanonicalRoute(
    route: Omit<CategoryRoute, 'id' | 'createdAt' | 'isCanonical'>,
  ): Promise<CategoryRoute>;
}

export interface ProductWithTranslations extends Product {
  readonly translations: readonly ProductTranslation[];
}

export interface ProductRepository {
  findById(id: string): Promise<ProductWithTranslations | undefined>;
  findByPublicId(publicId: string): Promise<ProductWithTranslations | undefined>;
  findBySku(sku: string): Promise<ProductWithTranslations | undefined>;
  create(
    product: Omit<Product, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<ProductTranslation, 'createdAt' | 'updatedAt'>[],
  ): Promise<ProductWithTranslations>;
  /** Throws ConcurrencyConflictError on a stale expectedVersion. */
  updateStatus(
    id: string,
    expectedVersion: number,
    status: Product['status'],
  ): Promise<ProductWithTranslations>;
}

export interface ContentWithTranslations extends Content {
  readonly translations: readonly (ContentTranslation & {
    readonly routes: readonly ContentRoute[];
  })[];
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
    translations: readonly Omit<ContentTranslation, 'createdAt' | 'updatedAt'>[],
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
}

export interface OrderWithLines extends Order {
  readonly lines: readonly OrderLine[];
  readonly statusHistory: readonly OrderStatusHistoryEntry[];
}

export interface OrderRepository {
  findById(id: string): Promise<OrderWithLines | undefined>;
  findByOrderNumber(orderNumber: string): Promise<OrderWithLines | undefined>;
  findByIdempotencyKey(idempotencyKey: string): Promise<OrderWithLines | undefined>;
  create(
    order: Omit<Order, 'version' | 'createdAt' | 'updatedAt'>,
    lines: readonly Omit<OrderLine, 'id'>[],
  ): Promise<OrderWithLines>;
}

export interface AuditEventRepository {
  record(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<AuditEvent>;
  listByEntity(entityType: string, entityId: string): Promise<readonly AuditEvent[]>;
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
}
