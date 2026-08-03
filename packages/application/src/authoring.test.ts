import { AccessDeniedError, ResourceNotFoundError, ValidationFailedError } from '@eramix/domain';
import type { CategoryRoute, ContentRoute } from '@eramix/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  addCategoryTranslation,
  addContentTranslation,
  addProductTranslation,
  createCategory,
  createContent,
  createProduct,
} from './authoring.js';
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

class SequentialIdGenerator {
  private counter = 0;
  async nextId(): Promise<string> {
    this.counter += 1;
    return `id-${this.counter}`;
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

describe('createCategory', () => {
  it('denies a role without catalog.write', async () => {
    const categoryRepo = { create: vi.fn() };
    await expect(
      createCategory(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          translations: [{ locale: 'en', name: 'Chairs' }],
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
    expect(categoryRepo.create).not.toHaveBeenCalled();
  });

  it('rejects an empty translation list', async () => {
    await expect(
      createCategory(
        {
          categoryRepo: { create: vi.fn() } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        { translations: [], actorUserId: 'admin-1', actorRole: 'ADMIN' },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('creates a category with a translation, establishes its canonical route, and records audit + outbox', async () => {
    const created: CategoryWithTranslations = {
      id: 'id-1',
      status: 'DRAFT',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      translations: [],
    };
    const withRoute: CategoryWithTranslations = {
      ...created,
      translations: [
        {
          id: 'id-2',
          categoryId: 'id-1',
          locale: 'en',
          name: 'Chairs',
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 0,
          routes: [
            {
              id: 'route-1',
              translationId: 'id-2',
              locale: 'en',
              slug: 'chairs',
              isCanonical: true,
              createdAt: new Date(),
            },
          ],
        },
      ],
    };
    const setCanonicalRoute = vi.fn(() =>
      Promise.resolve(withRoute.translations[0]!.routes[0]! satisfies CategoryRoute),
    );
    const categoryRepo = {
      create: vi.fn(() => Promise.resolve(created)),
      setCanonicalRoute,
      findById: vi.fn(() => Promise.resolve(withRoute)),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await createCategory(
      {
        categoryRepo: categoryRepo as never,
        auditRepo,
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
      },
      {
        translations: [{ locale: 'en', name: 'Chairs', slug: 'Chairs ' }],
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(result).toBe(withRoute);
    expect(categoryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-1', status: 'DRAFT' }),
      [expect.objectContaining({ id: 'id-2', locale: 'en', name: 'Chairs' })],
    );
    expect(setCanonicalRoute).toHaveBeenCalledWith({
      translationId: 'id-2',
      locale: 'en',
      slug: 'chairs',
    });
    expect(auditRepo.calls).toEqual([expect.objectContaining({ action: 'category.created' })]);
    expect(outboxRepo.calls).toEqual([expect.objectContaining({ eventType: 'category.created' })]);
  });
});

describe('addCategoryTranslation', () => {
  it('throws ResourceNotFoundError for an unknown category', async () => {
    const categoryRepo = { findById: () => Promise.resolve(undefined) };
    await expect(
      addCategoryTranslation(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          categoryId: 'missing',
          locale: 'ru',
          name: 'Стулья',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('adds a translation to an existing category', async () => {
    const existing: CategoryWithTranslations = {
      id: 'category-1',
      status: 'DRAFT',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      translations: [],
    };
    const addTranslation = vi.fn(() => Promise.resolve(existing));
    const categoryRepo = {
      findById: vi.fn(() => Promise.resolve(existing)),
      addTranslation,
    };
    const result = await addCategoryTranslation(
      {
        categoryRepo: categoryRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
      },
      {
        categoryId: 'category-1',
        locale: 'ru',
        name: 'Стулья',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(result).toBe(existing);
    expect(addTranslation).toHaveBeenCalledWith(
      'category-1',
      expect.objectContaining({ locale: 'ru', name: 'Стулья' }),
    );
  });
});

describe('createProduct', () => {
  it('rejects an empty sku', async () => {
    await expect(
      createProduct(
        {
          productRepo: { create: vi.fn() } as never,
          categoryRepo: { findById: () => Promise.resolve(undefined) },
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          sku: '   ',
          categoryId: 'category-1',
          translations: [{ locale: 'en', name: 'Chair', slug: 'chair' }],
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('throws ResourceNotFoundError when the category does not exist', async () => {
    await expect(
      createProduct(
        {
          productRepo: { create: vi.fn() } as never,
          categoryRepo: { findById: () => Promise.resolve(undefined) },
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          sku: 'SKU-1',
          categoryId: 'missing-category',
          translations: [{ locale: 'en', name: 'Chair', slug: 'chair' }],
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('creates a product with a generated publicId and normalized translation slugs', async () => {
    const category: CategoryWithTranslations = {
      id: 'category-1',
      status: 'PUBLISHED',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      translations: [],
    };
    let capturedProduct: unknown;
    let capturedTranslations: unknown;
    const productRepo = {
      create: vi.fn((product: unknown, translations: unknown) => {
        capturedProduct = product;
        capturedTranslations = translations;
        return Promise.resolve({
          ...(product as object),
          translations,
        } as unknown as ProductWithTranslations);
      }),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await createProduct(
      {
        productRepo: productRepo as never,
        categoryRepo: { findById: () => Promise.resolve(category) },
        auditRepo,
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
      },
      {
        sku: '  SKU-1  ',
        categoryId: 'category-1',
        translations: [
          {
            locale: 'en',
            name: 'Oak Chair',
            slug: 'Oak-Chair',
            indicativePrice: { priceFromMinor: 5000, currency: 'USD' },
          },
        ],
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(productRepo.create).toHaveBeenCalledTimes(1);
    expect(capturedProduct).toMatchObject({
      sku: 'SKU-1',
      categoryId: 'category-1',
      status: 'DRAFT',
    });
    expect((capturedProduct as { publicId: string }).publicId).toMatch(/^[0-9A-Z]{8}$/);
    expect(capturedTranslations).toEqual([
      expect.objectContaining({
        locale: 'en',
        name: 'Oak Chair',
        slug: 'oak-chair',
        indicativePrice: expect.objectContaining({ priceFromMinor: 5000, currency: 'USD' }),
      }),
    ]);
    expect(result).toBeDefined();
    expect(auditRepo.calls).toEqual([expect.objectContaining({ action: 'product.created' })]);
    expect(outboxRepo.calls).toEqual([expect.objectContaining({ eventType: 'product.created' })]);
  });
});

describe('addProductTranslation', () => {
  it('throws ResourceNotFoundError for an unknown product', async () => {
    await expect(
      addProductTranslation(
        {
          productRepo: { findById: () => Promise.resolve(undefined) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          productId: 'missing',
          locale: 'ru',
          name: 'Дубовый стул',
          slug: 'dubovyi-stul',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});

describe('createContent', () => {
  it('rejects a slug on a FAQ_ITEM translation (no per-item route namespace)', async () => {
    await expect(
      createContent(
        {
          contentRepo: { create: vi.fn() } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          type: 'FAQ_ITEM',
          translations: [
            { locale: 'en', title: 'Shipping?', content: 'We ship worldwide.', slug: 'shipping' },
          ],
          actorUserId: 'editor-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('creates an ARTICLE with a canonical route in the ARTICLES namespace', async () => {
    const created: ContentWithTranslations = {
      id: 'id-1',
      type: 'ARTICLE',
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      translations: [],
    };
    const setCanonicalRoute = vi.fn(() =>
      Promise.resolve({
        id: 'route-1',
        translationId: 'id-2',
        locale: 'en',
        namespace: 'ARTICLES',
        slug: 'festival',
        isCanonical: true,
        createdAt: new Date(),
      } satisfies ContentRoute),
    );
    const contentRepo = {
      create: vi.fn(() => Promise.resolve(created)),
      setCanonicalRoute,
      findById: vi.fn(() => Promise.resolve(created)),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    await createContent(
      {
        contentRepo: contentRepo as never,
        auditRepo,
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
      },
      {
        type: 'ARTICLE',
        translations: [
          { locale: 'en', title: 'Festival', content: { blocks: [] }, slug: 'Festival' },
        ],
        actorUserId: 'editor-1',
        actorRole: 'CONTENT_EDITOR',
      },
    );

    expect(setCanonicalRoute).toHaveBeenCalledWith({
      translationId: 'id-2',
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'festival',
    });
    expect(auditRepo.calls).toEqual([expect.objectContaining({ action: 'content.created' })]);
  });

  it('creates a FAQ_ITEM without any route (no slug supplied)', async () => {
    const created: ContentWithTranslations = {
      id: 'id-1',
      type: 'FAQ_ITEM',
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      translations: [],
    };
    const setCanonicalRoute = vi.fn();
    const contentRepo = {
      create: vi.fn(() => Promise.resolve(created)),
      setCanonicalRoute,
    };
    const result = await createContent(
      {
        contentRepo: contentRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
      },
      {
        type: 'FAQ_ITEM',
        translations: [{ locale: 'en', title: 'Shipping?', content: 'We ship worldwide.' }],
        actorUserId: 'editor-1',
        actorRole: 'CONTENT_EDITOR',
      },
    );
    expect(result).toBe(created);
    expect(setCanonicalRoute).not.toHaveBeenCalled();
  });
});

describe('addContentTranslation', () => {
  it('throws ResourceNotFoundError for an unknown content item', async () => {
    await expect(
      addContentTranslation(
        {
          contentRepo: { findById: () => Promise.resolve(undefined) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          contentId: 'missing',
          locale: 'ru',
          title: 'Доставка?',
          content: 'Доставляем по всему миру.',
          actorUserId: 'editor-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('rejects a slug when the existing content item is a FAQ_ITEM', async () => {
    const existing: ContentWithTranslations = {
      id: 'content-1',
      type: 'FAQ_ITEM',
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      translations: [],
    };
    await expect(
      addContentTranslation(
        {
          contentRepo: { findById: () => Promise.resolve(existing) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          contentId: 'content-1',
          locale: 'ru',
          title: 'Доставка?',
          content: 'Доставляем по всему миру.',
          slug: 'delivery',
          actorUserId: 'editor-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });
});
