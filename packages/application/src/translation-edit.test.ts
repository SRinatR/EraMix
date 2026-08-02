import { AccessDeniedError, ResourceNotFoundError, ValidationFailedError } from '@eramix/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  updateCategoryTranslation,
  updateContentTranslation,
  updateProductTranslation,
} from './translation-edit.js';
import type {
  AuditEventRepository,
  CategoryWithTranslations,
  ContentWithTranslations,
  OutboxMessageRepository,
  ProductWithTranslations,
} from './repositories.js';

class InMemoryUnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

function fakeAuditRepo(): AuditEventRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    record: (event) => {
      calls.push(event);
      return Promise.resolve({ id: 'audit-1', createdAt: new Date(), ...event });
    },
    listByEntity: () => Promise.resolve({ items: [], total: 0, limit: 20, offset: 0 }),
  };
}

function fakeOutboxRepo(): OutboxMessageRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    enqueue: (message) => {
      calls.push(message);
      return Promise.resolve({
        id: 'outbox-1',
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        ...message,
      });
    },
    claimPending: () => Promise.resolve([]),
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
    markDeadLetter: () => Promise.resolve(),
  };
}

const draftCategory: CategoryWithTranslations = {
  id: 'category-1',
  status: 'DRAFT',
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 0,
  translations: [
    {
      id: 'translation-1',
      categoryId: 'category-1',
      locale: 'en',
      name: 'Chairs',
      seoTitle: 'Chairs | EraMix',
      seoDescription: 'Browse our chairs.',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [],
    },
  ],
};

const publishedCategory: CategoryWithTranslations = { ...draftCategory, status: 'PUBLISHED' };

describe('updateCategoryTranslation', () => {
  it('denies a role without catalog.write', async () => {
    const categoryRepo = { findById: vi.fn(), updateTranslation: vi.fn() };
    await expect(
      updateCategoryTranslation(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          categoryId: 'category-1',
          translationId: 'translation-1',
          expectedVersion: 0,
          name: 'Chairs (new)',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
    expect(categoryRepo.findById).not.toHaveBeenCalled();
  });

  it('404s when the category does not exist', async () => {
    const categoryRepo = { findById: () => Promise.resolve(undefined), updateTranslation: vi.fn() };
    await expect(
      updateCategoryTranslation(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          categoryId: 'category-1',
          translationId: 'translation-1',
          expectedVersion: 0,
          name: 'Chairs (new)',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('404s when the translation does not belong to the category', async () => {
    const categoryRepo = {
      findById: () => Promise.resolve(draftCategory),
      updateTranslation: vi.fn(),
    };
    await expect(
      updateCategoryTranslation(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          categoryId: 'category-1',
          translationId: 'no-such-translation',
          expectedVersion: 0,
          name: 'Chairs (new)',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
    expect(categoryRepo.updateTranslation).not.toHaveBeenCalled();
  });

  it('rejects clearing seoTitle on a translation of a PUBLISHED category', async () => {
    const categoryRepo = {
      findById: () => Promise.resolve(publishedCategory),
      updateTranslation: vi.fn(),
    };
    await expect(
      updateCategoryTranslation(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          categoryId: 'category-1',
          translationId: 'translation-1',
          expectedVersion: 0,
          seoTitle: null,
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
    expect(categoryRepo.updateTranslation).not.toHaveBeenCalled();
  });

  it('edits name/SEO fields, never touches slug, and records audit + outbox', async () => {
    const updated: CategoryWithTranslations = {
      ...draftCategory,
      translations: [{ ...draftCategory.translations[0]!, name: 'Armchairs', version: 1 }],
    };
    const categoryRepo = {
      findById: () => Promise.resolve(draftCategory),
      updateTranslation: vi.fn().mockResolvedValue(updated),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await updateCategoryTranslation(
      {
        categoryRepo: categoryRepo as never,
        auditRepo,
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
      },
      {
        categoryId: 'category-1',
        translationId: 'translation-1',
        expectedVersion: 0,
        name: 'Armchairs',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(result).toEqual(updated);
    expect(categoryRepo.updateTranslation).toHaveBeenCalledWith('category-1', 'translation-1', 0, {
      name: 'Armchairs',
    });
    expect(auditRepo.calls).toEqual([
      expect.objectContaining({
        action: 'category.translation_updated',
        entityId: 'category-1',
        metadata: { translationId: 'translation-1', locale: 'en', fields: ['name'] },
      }),
    ]);
    expect(outboxRepo.calls).toEqual([
      expect.objectContaining({
        aggregateType: 'Category',
        aggregateId: 'category-1',
        eventType: 'category.translation_updated',
      }),
    ]);
  });
});

const draftProduct: ProductWithTranslations = {
  id: 'product-1',
  publicId: 'P8K4F2M9',
  sku: 'SKU-1',
  categoryId: 'category-1',
  status: 'DRAFT',
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 0,
  translations: [
    {
      id: 'translation-1',
      productId: 'product-1',
      locale: 'en',
      name: 'Oak table',
      slug: 'oak-table',
      seoTitle: 'Oak table | EraMix',
      seoDescription: 'A sturdy oak table.',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
    },
  ],
};

describe('updateProductTranslation', () => {
  it('denies a role without catalog.write', async () => {
    const productRepo = { findById: vi.fn(), updateTranslation: vi.fn() };
    await expect(
      updateProductTranslation(
        {
          productRepo: productRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          productId: 'product-1',
          translationId: 'translation-1',
          expectedVersion: 0,
          name: 'Oak table (new)',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
    expect(productRepo.findById).not.toHaveBeenCalled();
  });

  it('never accepts a slug field — editing never silently changes the URL', async () => {
    const updated = {
      ...draftProduct,
      translations: [{ ...draftProduct.translations[0]!, description: 'Solid oak.', version: 1 }],
    };
    const productRepo = {
      findById: () => Promise.resolve(draftProduct),
      updateTranslation: vi.fn().mockResolvedValue(updated),
    };
    await updateProductTranslation(
      {
        productRepo: productRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        productId: 'product-1',
        translationId: 'translation-1',
        expectedVersion: 0,
        description: 'Solid oak.',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    const patch = productRepo.updateTranslation.mock.calls[0]![3] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('slug');
    expect(patch).toEqual({ description: 'Solid oak.' });
  });

  it('sets a validated indicative price and records which fields changed', async () => {
    const updated = { ...draftProduct };
    const productRepo = {
      findById: () => Promise.resolve(draftProduct),
      updateTranslation: vi.fn().mockResolvedValue(updated),
    };
    const auditRepo = fakeAuditRepo();

    await updateProductTranslation(
      {
        productRepo: productRepo as never,
        auditRepo,
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        productId: 'product-1',
        translationId: 'translation-1',
        expectedVersion: 0,
        indicativePrice: { priceFromMinor: 15000, currency: 'USD' },
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(productRepo.updateTranslation).toHaveBeenCalledWith('product-1', 'translation-1', 0, {
      indicativePrice: {
        priceFromMinor: 15000,
        currency: 'USD',
        priceMode: 'FROM_PRICE_INDICATIVE',
      },
    });
    expect(auditRepo.calls).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({ fields: ['indicativePrice'] }),
      }),
    ]);
  });

  it('clears the indicative price when null is passed', async () => {
    const productRepo = {
      findById: () => Promise.resolve(draftProduct),
      updateTranslation: vi.fn().mockResolvedValue(draftProduct),
    };
    await updateProductTranslation(
      {
        productRepo: productRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        productId: 'product-1',
        translationId: 'translation-1',
        expectedVersion: 0,
        indicativePrice: null,
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(productRepo.updateTranslation).toHaveBeenCalledWith('product-1', 'translation-1', 0, {
      indicativePrice: null,
    });
  });

  it('rejects clearing seoDescription on a translation of a PUBLISHED product', async () => {
    const publishedProduct = { ...draftProduct, status: 'PUBLISHED' as const };
    const productRepo = {
      findById: () => Promise.resolve(publishedProduct),
      updateTranslation: vi.fn(),
    };
    await expect(
      updateProductTranslation(
        {
          productRepo: productRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          productId: 'product-1',
          translationId: 'translation-1',
          expectedVersion: 0,
          seoDescription: null,
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
    expect(productRepo.updateTranslation).not.toHaveBeenCalled();
  });
});

const draftContent: ContentWithTranslations = {
  id: 'content-1',
  type: 'ARTICLE',
  status: 'DRAFT',
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 0,
  translations: [
    {
      id: 'translation-1',
      contentId: 'content-1',
      locale: 'en',
      title: 'Friendship festival',
      content: ['Once upon a time.'],
      seoTitle: 'Friendship festival | EraMix',
      seoDescription: 'Read about the friendship festival.',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [],
    },
  ],
};

describe('updateContentTranslation', () => {
  it('denies a role without content.write', async () => {
    const contentRepo = { findById: vi.fn(), updateTranslation: vi.fn() };
    await expect(
      updateContentTranslation(
        {
          contentRepo: contentRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          contentId: 'content-1',
          translationId: 'translation-1',
          expectedVersion: 0,
          title: 'New title',
          actorUserId: 'user-1',
          actorRole: 'MANAGER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
    expect(contentRepo.findById).not.toHaveBeenCalled();
  });

  it('replaces the body and records the change in the audit trail', async () => {
    const updated = {
      ...draftContent,
      translations: [{ ...draftContent.translations[0]!, content: ['Updated body.'], version: 1 }],
    };
    const contentRepo = {
      findById: () => Promise.resolve(draftContent),
      updateTranslation: vi.fn().mockResolvedValue(updated),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await updateContentTranslation(
      {
        contentRepo: contentRepo as never,
        auditRepo,
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
      },
      {
        contentId: 'content-1',
        translationId: 'translation-1',
        expectedVersion: 0,
        content: ['Updated body.'],
        actorUserId: 'editor-1',
        actorRole: 'CONTENT_EDITOR',
      },
    );

    expect(result).toEqual(updated);
    expect(contentRepo.updateTranslation).toHaveBeenCalledWith('content-1', 'translation-1', 0, {
      content: ['Updated body.'],
    });
    expect(auditRepo.calls).toEqual([
      expect.objectContaining({
        action: 'content.translation_updated',
        metadata: { translationId: 'translation-1', locale: 'en', fields: ['content'] },
      }),
    ]);
    expect(outboxRepo.calls).toHaveLength(1);
  });

  it('rejects clearing seoTitle on a translation of PUBLISHED content', async () => {
    const publishedContent = { ...draftContent, status: 'PUBLISHED' as const };
    const contentRepo = {
      findById: () => Promise.resolve(publishedContent),
      updateTranslation: vi.fn(),
    };
    await expect(
      updateContentTranslation(
        {
          contentRepo: contentRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          contentId: 'content-1',
          translationId: 'translation-1',
          expectedVersion: 0,
          seoTitle: null,
          actorUserId: 'editor-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
    expect(contentRepo.updateTranslation).not.toHaveBeenCalled();
  });
});
