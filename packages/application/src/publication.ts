import {
  ResourceNotFoundError,
  ValidationFailedError,
  validateRetirementReason,
  articleUrl,
  categoryUrl,
  pageUrl,
  productUrl,
  type PlatformRole,
  type PublicationStatus,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { UnitOfWork } from './ports.js';
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
 * Phase 6 exit criterion (CLAUDE.md/IMPLEMENTATION_ROADMAP.md): "Publication
 * validates required SEO fields, canonical route, links, and slug uniqueness
 * before it becomes public." Before this module, `status: 'PUBLISHED'` was
 * just a column any direct repository call could set with no gate. Slug
 * uniqueness is already enforced by the partial unique index at route-write
 * time (SlugConflictError); this module enforces the remaining checks —
 * required SEO fields and canonical-route existence per translation — only
 * when transitioning *into* PUBLISHED. Transitions to DRAFT/ARCHIVED are
 * never blocked (an editor must always be able to unpublish).
 */

export interface TransitionStatusInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly toStatus: PublicationStatus;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string;
}

export interface RetireInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string;
}

/**
 * A retired resource is durably gone (CLAUDE.md: "HTTP 410 only for an
 * explicit, durable 'permanently retired' state") — once retiredAt is set,
 * no further status transition (including back to DRAFT/PUBLISHED) is ever
 * permitted. This is the application-layer half of the guarantee; the
 * migration's *_retired_requires_archived CHECK constraint is the data-layer
 * half.
 */
function assertNotRetired(current: {
  readonly id: string;
  readonly retiredAt?: Date | undefined;
}): void {
  if (current.retiredAt !== undefined) {
    throw new ValidationFailedError(
      `Resource ${current.id} is permanently retired and its status can no longer change.`,
      { id: current.id, retiredAt: current.retiredAt },
    );
  }
}

function assertCategoryPublishable(category: CategoryWithTranslations): void {
  if (category.translations.length === 0) {
    throw new ValidationFailedError('Cannot publish a category with no translations.', {
      categoryId: category.id,
    });
  }
  for (const translation of category.translations) {
    if (!translation.seoTitle || !translation.seoDescription) {
      throw new ValidationFailedError(
        `Category translation "${translation.locale}" is missing required SEO fields (seoTitle/seoDescription).`,
        { categoryId: category.id, translationId: translation.id, locale: translation.locale },
      );
    }
    if (!translation.routes.some((route) => route.isCanonical)) {
      throw new ValidationFailedError(
        `Category translation "${translation.locale}" has no canonical route.`,
        { categoryId: category.id, translationId: translation.id, locale: translation.locale },
      );
    }
  }
}

/**
 * Canonical URLs affected by a transition *into* PUBLISHED — the P1
 * IndexNow adapter (apps/worker) submits exactly these, never a
 * client-supplied or bulk-derived list (CLAUDE.md: "publish only canonical
 * URLs after a successful public content/redirect state transition").
 * Relative paths only; the worker prefixes the live canonical host at
 * submission time (packages/application has no notion of the deployment's
 * PlatformSettings-configured host).
 */
function categoryCanonicalUrls(category: CategoryWithTranslations): readonly string[] {
  const urls: string[] = [];
  for (const translation of category.translations) {
    const canonical = translation.routes.find((route) => route.isCanonical);
    if (canonical) {
      urls.push(categoryUrl({ locale: translation.locale, slug: canonical.slug }));
    }
  }
  return urls;
}

/** FAQ_ITEM has no per-item route (ContentRouteNamespace only covers ARTICLES/PAGES) — never included. */
function contentCanonicalUrls(content: ContentWithTranslations): readonly string[] {
  if (content.type !== 'ARTICLE' && content.type !== 'PAGE') {
    return [];
  }
  const buildUrl = content.type === 'ARTICLE' ? articleUrl : pageUrl;
  const urls: string[] = [];
  for (const translation of content.translations) {
    const canonical = translation.routes.find((route) => route.isCanonical);
    if (canonical) {
      urls.push(buildUrl({ locale: translation.locale, slug: canonical.slug }));
    }
  }
  return urls;
}

function productCanonicalUrls(product: ProductWithTranslations): readonly string[] {
  return product.translations.map((translation) =>
    productUrl({ locale: translation.locale, publicId: product.publicId, slug: translation.slug }),
  );
}

export async function transitionCategoryStatus(
  deps: {
    categoryRepo: CategoryRepository;
    auditRepo: AuditEventRepository;
    outboxRepo: OutboxMessageRepository;
    uow: UnitOfWork;
  },
  input: TransitionStatusInput,
): Promise<CategoryWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const current = await deps.categoryRepo.findById(input.id);
    if (!current) {
      throw new ResourceNotFoundError(`Category ${input.id} not found.`, { id: input.id });
    }
    assertNotRetired(current);
    if (input.toStatus === 'PUBLISHED') {
      assertCategoryPublishable(current);
    }
    const updated = await deps.categoryRepo.updateStatus(
      input.id,
      input.expectedVersion,
      input.toStatus,
    );
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'category.status_changed',
      entityType: 'Category',
      entityId: input.id,
      metadata: { previousStatus: current.status, newStatus: input.toStatus },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Category',
      aggregateId: input.id,
      eventType: 'category.status_changed',
      payload: {
        previousStatus: current.status,
        newStatus: input.toStatus,
        ...(input.toStatus === 'PUBLISHED'
          ? { canonicalUrls: categoryCanonicalUrls(updated) }
          : {}),
      },
    });
    return updated;
  });
}

function assertContentPublishable(content: ContentWithTranslations): void {
  if (content.translations.length === 0) {
    throw new ValidationFailedError('Cannot publish content with no translations.', {
      contentId: content.id,
    });
  }
  for (const translation of content.translations) {
    if (!translation.seoTitle || !translation.seoDescription) {
      throw new ValidationFailedError(
        `Content translation "${translation.locale}" is missing required SEO fields (seoTitle/seoDescription).`,
        { contentId: content.id, translationId: translation.id, locale: translation.locale },
      );
    }
    // FAQ_ITEM has no per-item route at all (ContentRouteNamespace only
    // covers ARTICLES/PAGES — packages/application/src/authoring.ts rejects
    // a FAQ_ITEM translation that even supplies a slug), so requiring a
    // canonical route here would make a FAQ_ITEM permanently unpublishable.
    // Found and fixed while adding IndexNow's canonicalUrls computation,
    // which surfaced this real pre-existing gap.
    if (content.type !== 'FAQ_ITEM' && !translation.routes.some((route) => route.isCanonical)) {
      throw new ValidationFailedError(
        `Content translation "${translation.locale}" has no canonical route.`,
        { contentId: content.id, translationId: translation.id, locale: translation.locale },
      );
    }
  }
}

export async function transitionContentStatus(
  deps: {
    contentRepo: ContentRepository;
    auditRepo: AuditEventRepository;
    outboxRepo: OutboxMessageRepository;
    uow: UnitOfWork;
  },
  input: TransitionStatusInput,
): Promise<ContentWithTranslations> {
  requirePermission(input.actorRole, 'content.write');
  return deps.uow.runInTransaction(async () => {
    const current = await deps.contentRepo.findById(input.id);
    if (!current) {
      throw new ResourceNotFoundError(`Content ${input.id} not found.`, { id: input.id });
    }
    assertNotRetired(current);
    if (input.toStatus === 'PUBLISHED') {
      assertContentPublishable(current);
    }
    const updated = await deps.contentRepo.updateStatus(
      input.id,
      input.expectedVersion,
      input.toStatus,
    );
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'content.status_changed',
      entityType: 'Content',
      entityId: input.id,
      metadata: { previousStatus: current.status, newStatus: input.toStatus },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Content',
      aggregateId: input.id,
      eventType: 'content.status_changed',
      payload: {
        previousStatus: current.status,
        newStatus: input.toStatus,
        ...(input.toStatus === 'PUBLISHED' ? { canonicalUrls: contentCanonicalUrls(updated) } : {}),
      },
    });
    return updated;
  });
}

/** Product translations carry `slug` and SEO fields directly (no route-history table — CLAUDE.md: "Product history is not required because the immutable publicId resolves the product."). */
function assertProductPublishable(product: ProductWithTranslations): void {
  if (product.translations.length === 0) {
    throw new ValidationFailedError('Cannot publish a product with no translations.', {
      productId: product.id,
    });
  }
  for (const translation of product.translations) {
    if (!translation.slug) {
      throw new ValidationFailedError(`Product translation "${translation.locale}" has no slug.`, {
        productId: product.id,
        translationId: translation.id,
        locale: translation.locale,
      });
    }
    if (!translation.seoTitle || !translation.seoDescription) {
      throw new ValidationFailedError(
        `Product translation "${translation.locale}" is missing required SEO fields (seoTitle/seoDescription).`,
        { productId: product.id, translationId: translation.id, locale: translation.locale },
      );
    }
  }
}

export async function transitionProductStatus(
  deps: {
    productRepo: ProductRepository;
    auditRepo: AuditEventRepository;
    outboxRepo: OutboxMessageRepository;
    uow: UnitOfWork;
  },
  input: TransitionStatusInput,
): Promise<ProductWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const current = await deps.productRepo.findById(input.id);
    if (!current) {
      throw new ResourceNotFoundError(`Product ${input.id} not found.`, { id: input.id });
    }
    assertNotRetired(current);
    if (input.toStatus === 'PUBLISHED') {
      assertProductPublishable(current);
    }
    const updated = await deps.productRepo.updateStatus(
      input.id,
      input.expectedVersion,
      input.toStatus,
    );
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product.status_changed',
      entityType: 'Product',
      entityId: input.id,
      metadata: { previousStatus: current.status, newStatus: input.toStatus },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Product',
      aggregateId: input.id,
      eventType: 'product.status_changed',
      payload: {
        previousStatus: current.status,
        newStatus: input.toStatus,
        ...(input.toStatus === 'PUBLISHED' ? { canonicalUrls: productCanonicalUrls(updated) } : {}),
      },
    });
    return updated;
  });
}

/**
 * Retirement (CLAUDE.md: durable HTTP 410 state) is deliberately a second,
 * explicit step after unpublishing — never a side effect of ARCHIVED — so an
 * editor cannot accidentally make a route permanently 410 by unpublishing
 * it. Requires the resource to already be ARCHIVED (mirrors the migration's
 * *_retired_requires_archived CHECK constraint) and a real reason.
 */
function assertRetirable(current: {
  readonly id: string;
  readonly status: PublicationStatus;
}): void {
  if (current.status !== 'ARCHIVED') {
    throw new ValidationFailedError(
      `Resource ${current.id} must be unpublished (ARCHIVED) before it can be retired.`,
      { id: current.id, status: current.status },
    );
  }
}

export async function retireCategory(
  deps: {
    categoryRepo: CategoryRepository;
    auditRepo: AuditEventRepository;
    outboxRepo: OutboxMessageRepository;
    uow: UnitOfWork;
  },
  input: RetireInput,
): Promise<CategoryWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  const reason = validateRetirementReason(input.reason);
  return deps.uow.runInTransaction(async () => {
    const current = await deps.categoryRepo.findById(input.id);
    if (!current) {
      throw new ResourceNotFoundError(`Category ${input.id} not found.`, { id: input.id });
    }
    assertNotRetired(current);
    assertRetirable(current);
    const updated = await deps.categoryRepo.retire(input.id, input.expectedVersion, reason);
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'category.retired',
      entityType: 'Category',
      entityId: input.id,
      metadata: { reason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Category',
      aggregateId: input.id,
      eventType: 'category.retired',
      payload: { reason },
    });
    return updated;
  });
}

export async function retireContent(
  deps: {
    contentRepo: ContentRepository;
    auditRepo: AuditEventRepository;
    outboxRepo: OutboxMessageRepository;
    uow: UnitOfWork;
  },
  input: RetireInput,
): Promise<ContentWithTranslations> {
  requirePermission(input.actorRole, 'content.write');
  const reason = validateRetirementReason(input.reason);
  return deps.uow.runInTransaction(async () => {
    const current = await deps.contentRepo.findById(input.id);
    if (!current) {
      throw new ResourceNotFoundError(`Content ${input.id} not found.`, { id: input.id });
    }
    assertNotRetired(current);
    assertRetirable(current);
    const updated = await deps.contentRepo.retire(input.id, input.expectedVersion, reason);
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'content.retired',
      entityType: 'Content',
      entityId: input.id,
      metadata: { reason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Content',
      aggregateId: input.id,
      eventType: 'content.retired',
      payload: { reason },
    });
    return updated;
  });
}

export async function retireProduct(
  deps: {
    productRepo: ProductRepository;
    auditRepo: AuditEventRepository;
    outboxRepo: OutboxMessageRepository;
    uow: UnitOfWork;
  },
  input: RetireInput,
): Promise<ProductWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  const reason = validateRetirementReason(input.reason);
  return deps.uow.runInTransaction(async () => {
    const current = await deps.productRepo.findById(input.id);
    if (!current) {
      throw new ResourceNotFoundError(`Product ${input.id} not found.`, { id: input.id });
    }
    assertNotRetired(current);
    assertRetirable(current);
    const updated = await deps.productRepo.retire(input.id, input.expectedVersion, reason);
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product.retired',
      entityType: 'Product',
      entityId: input.id,
      metadata: { reason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Product',
      aggregateId: input.id,
      eventType: 'product.retired',
      payload: { reason },
    });
    return updated;
  });
}
