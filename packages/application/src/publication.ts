import {
  ResourceNotFoundError,
  ValidationFailedError,
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
      payload: { previousStatus: current.status, newStatus: input.toStatus },
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
    if (!translation.routes.some((route) => route.isCanonical)) {
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
      payload: { previousStatus: current.status, newStatus: input.toStatus },
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
      payload: { previousStatus: current.status, newStatus: input.toStatus },
    });
    return updated;
  });
}
