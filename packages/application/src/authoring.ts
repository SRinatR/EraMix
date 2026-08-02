import {
  ResourceNotFoundError,
  ValidationFailedError,
  createIndicativePrice,
  generatePublicId,
  normalizeSlug,
  type ContentRouteNamespace,
  type ContentType,
  type IndicativePriceInput,
  type LocaleCode,
  type PlatformRole,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { IdGenerator, UnitOfWork } from './ports.js';
import type {
  AuditEventRepository,
  CategoryRepository,
  CategoryWithTranslations,
  ContentRepository,
  ContentWithTranslations,
  OutboxMessageRepository,
  ProductRepository,
  ProductWithTranslations,
} from './repositories.js';

/**
 * Phase 6 gap this module closes (CLAUDE.md: "authoring new catalog and
 * content entities must work through real documented APIs and UI forms" —
 * status-transition CRUD alone is not sufficient). Creates the aggregate and
 * its first translation(s) in one transaction; a translation that carries a
 * `slug` (Category/Content — Product translations carry `slug` directly, no
 * separate route table) also gets its initial canonical route, so a freshly
 * created item can immediately satisfy publication.ts's publish gate without
 * a second round trip through the (separately wired) slug-change use case.
 */

const CONTENT_NAMESPACE_BY_TYPE: Readonly<Partial<Record<ContentType, ContentRouteNamespace>>> = {
  ARTICLE: 'ARTICLES',
  PAGE: 'PAGES',
};

function requireContentNamespace(type: ContentType): ContentRouteNamespace {
  const namespace = CONTENT_NAMESPACE_BY_TYPE[type];
  if (!namespace) {
    throw new ValidationFailedError(
      `Content type "${type}" has no route namespace and cannot have a slug (TZ Appendix F.3 — FAQ items have no per-item route).`,
      { type },
    );
  }
  return namespace;
}

export interface CreateCategoryTranslationInput {
  readonly locale: LocaleCode;
  readonly name: string;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  /** When provided, becomes this translation's initial canonical route. */
  readonly slug?: string | undefined;
}

export interface CreateCategoryInput {
  readonly parentId?: string | undefined;
  readonly sortOrder?: number | undefined;
  readonly translations: readonly CreateCategoryTranslationInput[];
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export interface CategoryAuthoringDeps {
  readonly categoryRepo: CategoryRepository;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
  readonly idGen: IdGenerator;
}

export async function createCategory(
  deps: CategoryAuthoringDeps,
  input: CreateCategoryInput,
): Promise<CategoryWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  if (input.translations.length === 0) {
    throw new ValidationFailedError('A category needs at least one translation.', {});
  }

  return deps.uow.runInTransaction(async () => {
    const categoryId = deps.idGen.nextId();
    const translationRows = input.translations.map((translation) => ({
      id: deps.idGen.nextId(),
      categoryId,
      locale: translation.locale,
      name: translation.name,
      seoTitle: translation.seoTitle,
      seoDescription: translation.seoDescription,
    }));
    const pendingRoutes = input.translations.map((translation, index) => ({
      translationId: translationRows[index]!.id,
      locale: translation.locale,
      slug: translation.slug !== undefined ? normalizeSlug(translation.slug) : undefined,
    }));

    let created = await deps.categoryRepo.create(
      {
        id: categoryId,
        parentId: input.parentId,
        status: 'DRAFT',
        sortOrder: input.sortOrder ?? 0,
      },
      translationRows,
    );

    for (const route of pendingRoutes) {
      if (route.slug !== undefined) {
        await deps.categoryRepo.setCanonicalRoute({
          translationId: route.translationId,
          locale: route.locale,
          slug: route.slug,
        });
      }
    }
    const withRoutes = await deps.categoryRepo.findById(categoryId);
    created = withRoutes ?? created;

    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'category.created',
      entityType: 'Category',
      entityId: categoryId,
      metadata: { locales: input.translations.map((t) => t.locale) },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Category',
      aggregateId: categoryId,
      eventType: 'category.created',
      payload: { categoryId },
    });
    return created;
  });
}

export interface AddCategoryTranslationInput {
  readonly categoryId: string;
  readonly locale: LocaleCode;
  readonly name: string;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  readonly slug?: string | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function addCategoryTranslation(
  deps: CategoryAuthoringDeps,
  input: AddCategoryTranslationInput,
): Promise<CategoryWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.categoryRepo.findById(input.categoryId);
    if (!existing) {
      throw new ResourceNotFoundError(`Category ${input.categoryId} not found.`, {
        id: input.categoryId,
      });
    }
    const translationId = deps.idGen.nextId();
    let updated = await deps.categoryRepo.addTranslation(input.categoryId, {
      id: translationId,
      categoryId: input.categoryId,
      locale: input.locale,
      name: input.name,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
    });
    if (input.slug !== undefined) {
      await deps.categoryRepo.setCanonicalRoute({
        translationId,
        locale: input.locale,
        slug: normalizeSlug(input.slug),
      });
      updated = (await deps.categoryRepo.findById(input.categoryId)) ?? updated;
    }
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'category.translation_added',
      entityType: 'Category',
      entityId: input.categoryId,
      metadata: { locale: input.locale },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Category',
      aggregateId: input.categoryId,
      eventType: 'category.translation_added',
      payload: { locale: input.locale },
    });
    return updated;
  });
}

export interface CreateProductTranslationInput {
  readonly locale: LocaleCode;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  readonly indicativePrice?: IndicativePriceInput | undefined;
}

export interface CreateProductInput {
  readonly sku: string;
  readonly categoryId: string;
  readonly translations: readonly CreateProductTranslationInput[];
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export interface ProductAuthoringDeps {
  readonly productRepo: ProductRepository;
  readonly categoryRepo: Pick<CategoryRepository, 'findById'>;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
  readonly idGen: IdGenerator;
}

export async function createProduct(
  deps: ProductAuthoringDeps,
  input: CreateProductInput,
): Promise<ProductWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  if (input.sku.trim().length === 0) {
    throw new ValidationFailedError('sku must not be empty.', {});
  }
  if (input.translations.length === 0) {
    throw new ValidationFailedError('A product needs at least one translation.', {});
  }

  return deps.uow.runInTransaction(async () => {
    const category = await deps.categoryRepo.findById(input.categoryId);
    if (!category) {
      throw new ResourceNotFoundError(`Category ${input.categoryId} not found.`, {
        categoryId: input.categoryId,
      });
    }

    const productId = deps.idGen.nextId();
    const publicId = generatePublicId();
    const created = await deps.productRepo.create(
      {
        id: productId,
        publicId,
        sku: input.sku.trim(),
        categoryId: input.categoryId,
        status: 'DRAFT',
        directSaleEnabled: false,
      },
      input.translations.map((translation) => ({
        id: deps.idGen.nextId(),
        productId,
        locale: translation.locale,
        name: translation.name,
        slug: normalizeSlug(translation.slug),
        description: translation.description,
        seoTitle: translation.seoTitle,
        seoDescription: translation.seoDescription,
        indicativePrice: createIndicativePrice(translation.indicativePrice ?? {}),
      })),
    );

    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product.created',
      entityType: 'Product',
      entityId: productId,
      metadata: { sku: created.sku, publicId },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Product',
      aggregateId: productId,
      eventType: 'product.created',
      payload: { publicId, sku: created.sku },
    });
    return created;
  });
}

export interface AddProductTranslationInput {
  readonly productId: string;
  readonly locale: LocaleCode;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  readonly indicativePrice?: IndicativePriceInput | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function addProductTranslation(
  deps: Pick<ProductAuthoringDeps, 'productRepo' | 'auditRepo' | 'outboxRepo' | 'uow' | 'idGen'>,
  input: AddProductTranslationInput,
): Promise<ProductWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.productRepo.findById(input.productId);
    if (!existing) {
      throw new ResourceNotFoundError(`Product ${input.productId} not found.`, {
        id: input.productId,
      });
    }
    const updated = await deps.productRepo.addTranslation(input.productId, {
      id: deps.idGen.nextId(),
      productId: input.productId,
      locale: input.locale,
      name: input.name,
      slug: normalizeSlug(input.slug),
      description: input.description,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      indicativePrice: createIndicativePrice(input.indicativePrice ?? {}),
    });
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product.translation_added',
      entityType: 'Product',
      entityId: input.productId,
      metadata: { locale: input.locale },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Product',
      aggregateId: input.productId,
      eventType: 'product.translation_added',
      payload: { locale: input.locale },
    });
    return updated;
  });
}

export interface CreateContentTranslationInput {
  readonly locale: LocaleCode;
  readonly title: string;
  readonly summary?: string | undefined;
  readonly content: unknown;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  /** Only valid for ARTICLE/PAGE — FAQ_ITEM has no per-item route. */
  readonly slug?: string | undefined;
}

export interface CreateContentInput {
  readonly type: ContentType;
  readonly translations: readonly CreateContentTranslationInput[];
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export interface ContentAuthoringDeps {
  readonly contentRepo: ContentRepository;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
  readonly idGen: IdGenerator;
}

export async function createContent(
  deps: ContentAuthoringDeps,
  input: CreateContentInput,
): Promise<ContentWithTranslations> {
  requirePermission(input.actorRole, 'content.write');
  if (input.translations.length === 0) {
    throw new ValidationFailedError('Content needs at least one translation.', {});
  }
  for (const translation of input.translations) {
    if (translation.slug !== undefined) {
      requireContentNamespace(input.type);
    }
  }

  return deps.uow.runInTransaction(async () => {
    const contentId = deps.idGen.nextId();
    const translationRows = input.translations.map((translation) => ({
      id: deps.idGen.nextId(),
      contentId,
      locale: translation.locale,
      title: translation.title,
      summary: translation.summary,
      content: translation.content,
      seoTitle: translation.seoTitle,
      seoDescription: translation.seoDescription,
    }));
    const pendingRoutes = input.translations.map((translation, index) => ({
      translationId: translationRows[index]!.id,
      locale: translation.locale,
      slug: translation.slug !== undefined ? normalizeSlug(translation.slug) : undefined,
    }));

    let created = await deps.contentRepo.create(
      { id: contentId, type: input.type, status: 'DRAFT' },
      translationRows,
    );

    if (pendingRoutes.some((route) => route.slug !== undefined)) {
      const namespace = requireContentNamespace(input.type);
      for (const route of pendingRoutes) {
        if (route.slug !== undefined) {
          await deps.contentRepo.setCanonicalRoute({
            translationId: route.translationId,
            locale: route.locale,
            namespace,
            slug: route.slug,
          });
        }
      }
      created = (await deps.contentRepo.findById(contentId)) ?? created;
    }

    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'content.created',
      entityType: 'Content',
      entityId: contentId,
      metadata: { type: input.type, locales: input.translations.map((t) => t.locale) },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Content',
      aggregateId: contentId,
      eventType: 'content.created',
      payload: { contentId, type: input.type },
    });
    return created;
  });
}

export interface AddContentTranslationInput {
  readonly contentId: string;
  readonly locale: LocaleCode;
  readonly title: string;
  readonly summary?: string | undefined;
  readonly content: unknown;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  readonly slug?: string | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function addContentTranslation(
  deps: ContentAuthoringDeps,
  input: AddContentTranslationInput,
): Promise<ContentWithTranslations> {
  requirePermission(input.actorRole, 'content.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.contentRepo.findById(input.contentId);
    if (!existing) {
      throw new ResourceNotFoundError(`Content ${input.contentId} not found.`, {
        id: input.contentId,
      });
    }
    if (input.slug !== undefined) {
      requireContentNamespace(existing.type);
    }
    const translationId = deps.idGen.nextId();
    let updated = await deps.contentRepo.addTranslation(input.contentId, {
      id: translationId,
      contentId: input.contentId,
      locale: input.locale,
      title: input.title,
      summary: input.summary,
      content: input.content,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
    });
    if (input.slug !== undefined) {
      await deps.contentRepo.setCanonicalRoute({
        translationId,
        locale: input.locale,
        namespace: requireContentNamespace(existing.type),
        slug: normalizeSlug(input.slug),
      });
      updated = (await deps.contentRepo.findById(input.contentId)) ?? updated;
    }
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'content.translation_added',
      entityType: 'Content',
      entityId: input.contentId,
      metadata: { locale: input.locale },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Content',
      aggregateId: input.contentId,
      eventType: 'content.translation_added',
      payload: { locale: input.locale },
    });
    return updated;
  });
}
