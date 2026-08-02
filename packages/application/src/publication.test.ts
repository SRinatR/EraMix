import { AccessDeniedError, ValidationFailedError, ResourceNotFoundError } from '@eramix/domain';
import type {
  CategoryRoute,
  CategoryTranslation,
  ContentRoute,
  ContentTranslation,
  ProductTranslation,
} from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import type {
  AuditEventRepository,
  CategoryWithTranslations,
  ContentWithTranslations,
  OutboxMessageRepository,
  ProductWithTranslations,
} from './repositories.js';
import {
  transitionCategoryStatus,
  transitionContentStatus,
  transitionProductStatus,
  retireCategory,
  retireContent,
  retireProduct,
} from './publication.js';

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
    listByEntity: () => Promise.resolve({ data: [], page: { hasMore: false } }),
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

const canonicalCategoryRoute: CategoryRoute = {
  id: 'route-1',
  translationId: 'translation-1',
  locale: 'en',
  slug: 'chairs',
  isCanonical: true,
  createdAt: new Date(),
};

function makeCategoryTranslation(
  overrides: Partial<CategoryTranslation & { routes: readonly CategoryRoute[] }> = {},
): CategoryTranslation & { routes: readonly CategoryRoute[] } {
  return {
    id: 'translation-1',
    categoryId: 'category-1',
    locale: 'en',
    name: 'Chairs',
    seoTitle: 'Chairs | EraMix',
    seoDescription: 'Browse our chairs.',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    routes: [canonicalCategoryRoute],
    ...overrides,
  };
}

function makeCategory(overrides: Partial<CategoryWithTranslations> = {}): CategoryWithTranslations {
  return {
    id: 'category-1',
    status: 'DRAFT',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations: [makeCategoryTranslation()],
    ...overrides,
  };
}

describe('transitionCategoryStatus', () => {
  it('denies a CONTENT_EDITOR (no catalog.write permission)', async () => {
    const categoryRepo = {
      findById: () => Promise.resolve(makeCategory()),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionCategoryStatus(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'category-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'user-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('rejects publishing when a translation is missing seoDescription', async () => {
    const category = makeCategory({
      translations: [makeCategoryTranslation({ seoDescription: undefined })],
    });
    const categoryRepo = {
      findById: () => Promise.resolve(category),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionCategoryStatus(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'category-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('rejects publishing when a translation has no canonical route', async () => {
    const category = makeCategory({
      translations: [makeCategoryTranslation({ routes: [] })],
    });
    const categoryRepo = {
      findById: () => Promise.resolve(category),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionCategoryStatus(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'category-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('throws ResourceNotFoundError for an unknown category', async () => {
    const categoryRepo = {
      findById: () => Promise.resolve(undefined),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionCategoryStatus(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'missing',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('publishes a complete category and records audit + outbox', async () => {
    const category = makeCategory();
    const published = { ...category, status: 'PUBLISHED' as const, version: 1 };
    const categoryRepo = {
      findById: () => Promise.resolve(category),
      updateStatus: () => Promise.resolve(published),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await transitionCategoryStatus(
      { categoryRepo: categoryRepo as never, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        id: 'category-1',
        expectedVersion: 0,
        toStatus: 'PUBLISHED',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(auditRepo.calls).toHaveLength(1);
    expect(auditRepo.calls[0]).toMatchObject({
      action: 'category.status_changed',
      metadata: { previousStatus: 'DRAFT', newStatus: 'PUBLISHED' },
    });
    expect(outboxRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls[0]).toMatchObject({
      eventType: 'category.status_changed',
      payload: { canonicalUrls: ['/en/catalog/chairs'] },
    });
  });

  it('never gates a transition to ARCHIVED (unpublish must always work)', async () => {
    const category = makeCategory({
      status: 'PUBLISHED',
      translations: [makeCategoryTranslation({ seoDescription: undefined, routes: [] })],
    });
    const archived = { ...category, status: 'ARCHIVED' as const, version: 1 };
    const categoryRepo = {
      findById: () => Promise.resolve(category),
      updateStatus: () => Promise.resolve(archived),
    };

    const result = await transitionCategoryStatus(
      {
        categoryRepo: categoryRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        id: 'category-1',
        expectedVersion: 0,
        toStatus: 'ARCHIVED',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(result.status).toBe('ARCHIVED');
  });

  it('rejects any status transition once a category is retired', async () => {
    const category = makeCategory({
      status: 'ARCHIVED',
      retiredAt: new Date('2026-08-03T00:00:00Z'),
      retirementReason: 'Discontinued.',
    });
    const categoryRepo = {
      findById: () => Promise.resolve(category),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionCategoryStatus(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'category-1',
          expectedVersion: 0,
          toStatus: 'DRAFT',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });
});

describe('retireCategory', () => {
  it('denies a CONTENT_EDITOR (no catalog.write permission)', async () => {
    const categoryRepo = {
      findById: () => Promise.resolve(makeCategory({ status: 'ARCHIVED' })),
      retire: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      retireCategory(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'category-1',
          expectedVersion: 0,
          reason: 'Discontinued.',
          actorUserId: 'user-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('rejects an empty reason', async () => {
    const categoryRepo = {
      findById: () => Promise.resolve(makeCategory({ status: 'ARCHIVED' })),
      retire: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      retireCategory(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'category-1',
          expectedVersion: 0,
          reason: '   ',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('rejects retiring a category that is not ARCHIVED', async () => {
    const categoryRepo = {
      findById: () => Promise.resolve(makeCategory({ status: 'PUBLISHED' })),
      retire: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      retireCategory(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'category-1',
          expectedVersion: 0,
          reason: 'Discontinued.',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('retires an ARCHIVED category and records audit + outbox', async () => {
    const category = makeCategory({ status: 'ARCHIVED' });
    const retired = {
      ...category,
      retiredAt: new Date('2026-08-03T00:00:00Z'),
      retirementReason: 'Discontinued.',
      version: 1,
    };
    const categoryRepo = {
      findById: () => Promise.resolve(category),
      retire: () => Promise.resolve(retired),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await retireCategory(
      { categoryRepo: categoryRepo as never, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        id: 'category-1',
        expectedVersion: 0,
        reason: 'Discontinued.',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(result.retiredAt).toBeDefined();
    expect(auditRepo.calls).toHaveLength(1);
    expect(auditRepo.calls[0]).toMatchObject({ action: 'category.retired' });
    expect(outboxRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'category.retired' });
  });
});

const canonicalContentRoute: ContentRoute = {
  id: 'route-1',
  translationId: 'translation-1',
  locale: 'en',
  namespace: 'ARTICLES',
  slug: 'friendship-festival',
  isCanonical: true,
  createdAt: new Date(),
};

function makeContentTranslation(
  overrides: Partial<ContentTranslation & { routes: readonly ContentRoute[] }> = {},
): ContentTranslation & { routes: readonly ContentRoute[] } {
  return {
    id: 'translation-1',
    contentId: 'content-1',
    locale: 'en',
    title: 'Friendship festival',
    content: {},
    seoTitle: 'Friendship festival | EraMix',
    seoDescription: 'Read about the friendship festival.',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    routes: [canonicalContentRoute],
    ...overrides,
  };
}

function makeContent(overrides: Partial<ContentWithTranslations> = {}): ContentWithTranslations {
  return {
    id: 'content-1',
    type: 'ARTICLE',
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations: [makeContentTranslation()],
    ...overrides,
  };
}

describe('transitionContentStatus', () => {
  it('denies a CUSTOMER (no content.write permission)', async () => {
    const contentRepo = {
      findById: () => Promise.resolve(makeContent()),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionContentStatus(
        {
          contentRepo: contentRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'content-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('rejects publishing when a translation is missing a canonical route', async () => {
    const content = makeContent({ translations: [makeContentTranslation({ routes: [] })] });
    const contentRepo = {
      findById: () => Promise.resolve(content),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionContentStatus(
        {
          contentRepo: contentRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'content-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'editor-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('publishes a complete content item and records audit + outbox', async () => {
    const content = makeContent();
    const published = { ...content, status: 'PUBLISHED' as const, version: 1 };
    const contentRepo = {
      findById: () => Promise.resolve(content),
      updateStatus: () => Promise.resolve(published),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await transitionContentStatus(
      { contentRepo: contentRepo as never, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        id: 'content-1',
        expectedVersion: 0,
        toStatus: 'PUBLISHED',
        actorUserId: 'editor-1',
        actorRole: 'CONTENT_EDITOR',
      },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(auditRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls[0]).toMatchObject({
      payload: { canonicalUrls: ['/en/articles/friendship-festival'] },
    });
  });

  it('never includes canonicalUrls for a FAQ_ITEM (no per-item route)', async () => {
    const content = makeContent({
      type: 'FAQ_ITEM',
      translations: [makeContentTranslation({ routes: [] })],
    });
    const published = { ...content, status: 'PUBLISHED' as const, version: 1 };
    const contentRepo = {
      findById: () => Promise.resolve(content),
      updateStatus: () => Promise.resolve(published),
    };
    const outboxRepo = fakeOutboxRepo();

    await transitionContentStatus(
      {
        contentRepo: contentRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
      },
      {
        id: 'content-1',
        expectedVersion: 0,
        toStatus: 'PUBLISHED',
        actorUserId: 'editor-1',
        actorRole: 'CONTENT_EDITOR',
      },
    );

    expect(outboxRepo.calls[0]).toMatchObject({ payload: { canonicalUrls: [] } });
  });
});

describe('retireContent', () => {
  it('rejects retiring a content item that is not ARCHIVED', async () => {
    const contentRepo = {
      findById: () => Promise.resolve(makeContent({ status: 'PUBLISHED' })),
      retire: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      retireContent(
        {
          contentRepo: contentRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'content-1',
          expectedVersion: 0,
          reason: 'Discontinued.',
          actorUserId: 'editor-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('retires an ARCHIVED content item and records audit + outbox', async () => {
    const content = makeContent({ status: 'ARCHIVED' });
    const retired = {
      ...content,
      retiredAt: new Date('2026-08-03T00:00:00Z'),
      retirementReason: 'Discontinued.',
      version: 1,
    };
    const contentRepo = {
      findById: () => Promise.resolve(content),
      retire: () => Promise.resolve(retired),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await retireContent(
      { contentRepo: contentRepo as never, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        id: 'content-1',
        expectedVersion: 0,
        reason: 'Discontinued.',
        actorUserId: 'editor-1',
        actorRole: 'CONTENT_EDITOR',
      },
    );

    expect(result.retiredAt).toBeDefined();
    expect(auditRepo.calls[0]).toMatchObject({ action: 'content.retired' });
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'content.retired' });
  });
});

function makeProductTranslation(overrides: Partial<ProductTranslation> = {}): ProductTranslation {
  return {
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
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ProductWithTranslations> = {}): ProductWithTranslations {
  return {
    id: 'product-1',
    publicId: 'P8K4F2M9',
    sku: 'SKU-1',
    categoryId: 'category-1',
    status: 'DRAFT',
    directSaleEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations: [makeProductTranslation()],
    ...overrides,
  };
}

describe('transitionProductStatus', () => {
  it('denies a CONTENT_EDITOR (no catalog.write permission)', async () => {
    const productRepo = {
      findById: () => Promise.resolve(makeProduct()),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionProductStatus(
        {
          productRepo: productRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'product-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'user-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('rejects publishing when a translation is missing SEO fields', async () => {
    const product = makeProduct({
      translations: [makeProductTranslation({ seoTitle: undefined })],
    });
    const productRepo = {
      findById: () => Promise.resolve(product),
      updateStatus: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      transitionProductStatus(
        {
          productRepo: productRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'product-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('publishes a complete product and records audit + outbox', async () => {
    const product = makeProduct();
    const published = { ...product, status: 'PUBLISHED' as const, version: 1 };
    const productRepo = {
      findById: () => Promise.resolve(product),
      updateStatus: () => Promise.resolve(published),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await transitionProductStatus(
      { productRepo: productRepo as never, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        id: 'product-1',
        expectedVersion: 0,
        toStatus: 'PUBLISHED',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(result.status).toBe('PUBLISHED');
    expect(auditRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls[0]).toMatchObject({
      payload: { canonicalUrls: ['/en/catalog/P8K4F2M9-oak-table'] },
    });
  });
});

describe('retireProduct', () => {
  it('rejects retiring a product that is not ARCHIVED', async () => {
    const productRepo = {
      findById: () => Promise.resolve(makeProduct({ status: 'PUBLISHED' })),
      retire: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      retireProduct(
        {
          productRepo: productRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'product-1',
          expectedVersion: 0,
          reason: 'Discontinued.',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('retires an ARCHIVED product and records audit + outbox', async () => {
    const product = makeProduct({ status: 'ARCHIVED' });
    const retired = {
      ...product,
      retiredAt: new Date('2026-08-03T00:00:00Z'),
      retirementReason: 'Discontinued.',
      version: 1,
    };
    const productRepo = {
      findById: () => Promise.resolve(product),
      retire: () => Promise.resolve(retired),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await retireProduct(
      { productRepo: productRepo as never, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        id: 'product-1',
        expectedVersion: 0,
        reason: 'Discontinued.',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(result.retiredAt).toBeDefined();
    expect(auditRepo.calls[0]).toMatchObject({ action: 'product.retired' });
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'product.retired' });
  });
});
