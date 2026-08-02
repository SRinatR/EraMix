import {
  ResourceNotFoundError,
  ValidationFailedError,
  createIndicativePrice,
  type IndicativePriceInput,
  type PlatformRole,
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
 * Editing an existing translation's editorial fields — the gap authoring.ts
 * (create/addTranslation, append-only per locale) and slug-change.ts (one
 * field, slug only) don't close: until this module, nothing could change a
 * translation's title/summary/body/description/SEO fields/indicative price
 * once it existed. `slug` is deliberately never accepted here — slug changes
 * stay the separate, explicitly audited command in slug-change.ts (CLAUDE.md:
 * "title edits must never silently change slugs"). Optimistic concurrency is
 * keyed on the translation's own `version` (added by the same migration that
 * introduced this module), not the parent aggregate's — editing a
 * translation's content never bumps the parent's status-transition version.
 *
 * If the parent aggregate is already PUBLISHED, an edit that would clear a
 * required SEO field is rejected outright (ValidationFailedError) rather than
 * silently producing a published item that fails publication.ts's own
 * publish gate — the editor must unpublish first, edit, then republish.
 */

export interface UpdateCategoryTranslationInput {
  readonly categoryId: string;
  readonly translationId: string;
  readonly expectedVersion: number;
  readonly name?: string | undefined;
  readonly seoTitle?: string | null | undefined;
  readonly seoDescription?: string | null | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function updateCategoryTranslation(
  deps: {
    readonly categoryRepo: CategoryRepository;
    readonly auditRepo: AuditEventRepository;
    readonly outboxRepo: OutboxMessageRepository;
    readonly uow: UnitOfWork;
  },
  input: UpdateCategoryTranslationInput,
): Promise<CategoryWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.categoryRepo.findById(input.categoryId);
    if (!existing) {
      throw new ResourceNotFoundError(`Category ${input.categoryId} not found.`, {
        id: input.categoryId,
      });
    }
    const translation = existing.translations.find((t) => t.id === input.translationId);
    if (!translation) {
      throw new ResourceNotFoundError(
        `Translation ${input.translationId} not found on category ${input.categoryId}.`,
        { categoryId: input.categoryId, translationId: input.translationId },
      );
    }

    if (existing.status === 'PUBLISHED') {
      const resultingSeoTitle =
        input.seoTitle !== undefined ? input.seoTitle : translation.seoTitle;
      const resultingSeoDescription =
        input.seoDescription !== undefined ? input.seoDescription : translation.seoDescription;
      if (!resultingSeoTitle || !resultingSeoDescription) {
        throw new ValidationFailedError(
          `Cannot clear seoTitle/seoDescription on translation "${translation.locale}" of a PUBLISHED category — unpublish it first.`,
          { categoryId: input.categoryId, translationId: input.translationId },
        );
      }
    }

    const changedFields = [
      ...(input.name !== undefined ? ['name'] : []),
      ...(input.seoTitle !== undefined ? ['seoTitle'] : []),
      ...(input.seoDescription !== undefined ? ['seoDescription'] : []),
    ];

    const updated = await deps.categoryRepo.updateTranslation(
      input.categoryId,
      input.translationId,
      input.expectedVersion,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
      },
    );

    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'category.translation_updated',
      entityType: 'Category',
      entityId: input.categoryId,
      metadata: {
        translationId: input.translationId,
        locale: translation.locale,
        fields: changedFields,
      },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Category',
      aggregateId: input.categoryId,
      eventType: 'category.translation_updated',
      payload: {
        translationId: input.translationId,
        locale: translation.locale,
        fields: changedFields,
      },
    });
    return updated;
  });
}

export interface UpdateProductTranslationInput {
  readonly productId: string;
  readonly translationId: string;
  readonly expectedVersion: number;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly seoTitle?: string | null | undefined;
  readonly seoDescription?: string | null | undefined;
  readonly indicativePrice?: IndicativePriceInput | null | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function updateProductTranslation(
  deps: {
    readonly productRepo: ProductRepository;
    readonly auditRepo: AuditEventRepository;
    readonly outboxRepo: OutboxMessageRepository;
    readonly uow: UnitOfWork;
  },
  input: UpdateProductTranslationInput,
): Promise<ProductWithTranslations> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.productRepo.findById(input.productId);
    if (!existing) {
      throw new ResourceNotFoundError(`Product ${input.productId} not found.`, {
        id: input.productId,
      });
    }
    const translation = existing.translations.find((t) => t.id === input.translationId);
    if (!translation) {
      throw new ResourceNotFoundError(
        `Translation ${input.translationId} not found on product ${input.productId}.`,
        { productId: input.productId, translationId: input.translationId },
      );
    }

    if (existing.status === 'PUBLISHED') {
      const resultingSeoTitle =
        input.seoTitle !== undefined ? input.seoTitle : translation.seoTitle;
      const resultingSeoDescription =
        input.seoDescription !== undefined ? input.seoDescription : translation.seoDescription;
      if (!resultingSeoTitle || !resultingSeoDescription) {
        throw new ValidationFailedError(
          `Cannot clear seoTitle/seoDescription on translation "${translation.locale}" of a PUBLISHED product — unpublish it first.`,
          { productId: input.productId, translationId: input.translationId },
        );
      }
    }

    const changedFields = [
      ...(input.name !== undefined ? ['name'] : []),
      ...(input.description !== undefined ? ['description'] : []),
      ...(input.seoTitle !== undefined ? ['seoTitle'] : []),
      ...(input.seoDescription !== undefined ? ['seoDescription'] : []),
      ...(input.indicativePrice !== undefined ? ['indicativePrice'] : []),
    ];

    const updated = await deps.productRepo.updateTranslation(
      input.productId,
      input.translationId,
      input.expectedVersion,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        ...(input.indicativePrice !== undefined
          ? {
              indicativePrice:
                input.indicativePrice === null
                  ? null
                  : (createIndicativePrice(input.indicativePrice) ?? null),
            }
          : {}),
      },
    );

    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product.translation_updated',
      entityType: 'Product',
      entityId: input.productId,
      metadata: {
        translationId: input.translationId,
        locale: translation.locale,
        fields: changedFields,
      },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Product',
      aggregateId: input.productId,
      eventType: 'product.translation_updated',
      payload: {
        translationId: input.translationId,
        locale: translation.locale,
        fields: changedFields,
      },
    });
    return updated;
  });
}

export interface UpdateContentTranslationInput {
  readonly contentId: string;
  readonly translationId: string;
  readonly expectedVersion: number;
  readonly title?: string | undefined;
  readonly summary?: string | null | undefined;
  readonly content?: unknown;
  readonly seoTitle?: string | null | undefined;
  readonly seoDescription?: string | null | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function updateContentTranslation(
  deps: {
    readonly contentRepo: ContentRepository;
    readonly auditRepo: AuditEventRepository;
    readonly outboxRepo: OutboxMessageRepository;
    readonly uow: UnitOfWork;
  },
  input: UpdateContentTranslationInput,
): Promise<ContentWithTranslations> {
  requirePermission(input.actorRole, 'content.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.contentRepo.findById(input.contentId);
    if (!existing) {
      throw new ResourceNotFoundError(`Content ${input.contentId} not found.`, {
        id: input.contentId,
      });
    }
    const translation = existing.translations.find((t) => t.id === input.translationId);
    if (!translation) {
      throw new ResourceNotFoundError(
        `Translation ${input.translationId} not found on content ${input.contentId}.`,
        { contentId: input.contentId, translationId: input.translationId },
      );
    }

    if (existing.status === 'PUBLISHED') {
      const resultingSeoTitle =
        input.seoTitle !== undefined ? input.seoTitle : translation.seoTitle;
      const resultingSeoDescription =
        input.seoDescription !== undefined ? input.seoDescription : translation.seoDescription;
      if (!resultingSeoTitle || !resultingSeoDescription) {
        throw new ValidationFailedError(
          `Cannot clear seoTitle/seoDescription on translation "${translation.locale}" of PUBLISHED content — unpublish it first.`,
          { contentId: input.contentId, translationId: input.translationId },
        );
      }
    }

    const changedFields = [
      ...(input.title !== undefined ? ['title'] : []),
      ...(input.summary !== undefined ? ['summary'] : []),
      ...(input.content !== undefined ? ['content'] : []),
      ...(input.seoTitle !== undefined ? ['seoTitle'] : []),
      ...(input.seoDescription !== undefined ? ['seoDescription'] : []),
    ];

    const updated = await deps.contentRepo.updateTranslation(
      input.contentId,
      input.translationId,
      input.expectedVersion,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
      },
    );

    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'content.translation_updated',
      entityType: 'Content',
      entityId: input.contentId,
      metadata: {
        translationId: input.translationId,
        locale: translation.locale,
        fields: changedFields,
      },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Content',
      aggregateId: input.contentId,
      eventType: 'content.translation_updated',
      payload: {
        translationId: input.translationId,
        locale: translation.locale,
        fields: changedFields,
      },
    });
    return updated;
  });
}
