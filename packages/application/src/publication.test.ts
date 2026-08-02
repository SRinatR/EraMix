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
    listByEntity: () => Promise.resolve([]),
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
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'category.status_changed' });
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
    publicId: 'PUB123',
    sku: 'SKU-1',
    categoryId: 'category-1',
    status: 'DRAFT',
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
  });
});
