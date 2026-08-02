import { CanonicalRouteMissingError, SlugConflictError } from '@eramix/domain';
import type {
  Content,
  ContentRoute,
  ContentTranslation,
  Product,
  ProductTranslation,
} from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import type { CursorPage } from './pagination.js';
import type {
  ContentRepository,
  ContentWithTranslations,
  ProductRepository,
} from './repositories.js';
import { resolveContentRoute, resolveProductRoute } from './route-resolution.js';

/**
 * In-memory test doubles for ContentRepository/ProductRepository, used only
 * to exercise the pure route-resolution branching logic above in isolation.
 * They are NOT a substitute for the pending PostgreSQL 19 Beta 2 integration
 * tests against PrismaContentRepository/PrismaProductRepository (still gated
 * on Raspberry Pi access) — those verify the real constraints (partial
 * unique canonical-route index, unique-per-locale translations, FK
 * cascades); these verify only that resolveContentRoute/resolveProductRoute
 * make the right canonical/redirect/not-found decision given a port-shaped
 * data source.
 */
class InMemoryContentRepository implements ContentRepository {
  private readonly contents = new Map<string, ContentWithTranslations>();
  private readonly routes: ContentRoute[] = [];
  private nextRouteId = 1;

  seed(content: ContentWithTranslations): void {
    this.contents.set(content.id, content);
    for (const translation of content.translations) {
      for (const route of translation.routes) {
        this.routes.push(route);
      }
    }
  }

  findById(id: string): Promise<ContentWithTranslations | undefined> {
    return Promise.resolve(this.contents.get(id));
  }

  async findByCanonicalSlug(
    namespace: ContentRoute['namespace'],
    locale: ContentRoute['locale'],
    slug: string,
  ): Promise<ContentWithTranslations | undefined> {
    const route = this.routes.find(
      (candidate) =>
        candidate.namespace === namespace &&
        candidate.locale === locale &&
        candidate.slug === slug &&
        candidate.isCanonical,
    );
    if (!route) {
      return undefined;
    }
    for (const content of this.contents.values()) {
      if (content.translations.some((translation) => translation.id === route.translationId)) {
        return content;
      }
    }
    return undefined;
  }

  findRouteBySlug(
    namespace: ContentRoute['namespace'],
    locale: ContentRoute['locale'],
    slug: string,
  ): Promise<ContentRoute | undefined> {
    return Promise.resolve(
      this.routes.find(
        (route) => route.namespace === namespace && route.locale === locale && route.slug === slug,
      ),
    );
  }

  findCanonicalRouteByTranslationId(translationId: string): Promise<ContentRoute | undefined> {
    return Promise.resolve(
      this.routes.find((route) => route.translationId === translationId && route.isCanonical),
    );
  }

  create(): Promise<ContentWithTranslations> {
    throw new Error('not needed for these tests');
  }

  addTranslation(): Promise<ContentWithTranslations> {
    throw new Error('not needed for these tests');
  }

  updateTranslation(): Promise<ContentWithTranslations> {
    throw new Error('not needed for these tests');
  }

  listPublished(): Promise<readonly ContentWithTranslations[]> {
    return Promise.resolve([...this.contents.values()].filter((c) => c.status === 'PUBLISHED'));
  }

  updateStatus(): Promise<ContentWithTranslations> {
    throw new Error('not needed for these tests');
  }

  retire(): Promise<ContentWithTranslations> {
    throw new Error('not needed for these tests');
  }

  listAll(): Promise<CursorPage<ContentWithTranslations>> {
    throw new Error('not needed for these tests');
  }

  async setCanonicalRoute(
    route: Omit<ContentRoute, 'id' | 'createdAt' | 'isCanonical'>,
  ): Promise<ContentRoute> {
    const collision = this.routes.find(
      (candidate) =>
        candidate.namespace === route.namespace &&
        candidate.locale === route.locale &&
        candidate.slug === route.slug,
    );
    if (collision) {
      throw new SlugConflictError('Slug already used by another route.', { route });
    }
    for (const existing of this.routes) {
      if (existing.translationId === route.translationId) {
        (existing as { isCanonical: boolean }).isCanonical = false;
      }
    }
    const created: ContentRoute = {
      id: String(this.nextRouteId++),
      translationId: route.translationId,
      locale: route.locale,
      namespace: route.namespace,
      slug: route.slug,
      isCanonical: true,
      createdAt: new Date(),
    };
    this.routes.push(created);
    return Promise.resolve(created);
  }
}

function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id: 'content-1',
    type: 'ARTICLE',
    status: 'PUBLISHED',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function makeTranslation(overrides: Partial<ContentTranslation> = {}): ContentTranslation {
  return {
    id: 'translation-1',
    contentId: 'content-1',
    locale: 'en',
    title: 'Friendship festival',
    content: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

describe('resolveContentRoute', () => {
  it('resolves the current canonical route', async () => {
    const repo = new InMemoryContentRepository();
    const translation = makeTranslation();
    repo.seed({
      ...makeContent(),
      translations: [
        {
          ...translation,
          routes: [
            {
              id: 'r1',
              translationId: translation.id,
              locale: 'en',
              namespace: 'ARTICLES',
              slug: 'friendship-festival',
              isCanonical: true,
              createdAt: new Date(),
            },
          ],
        },
      ],
    });

    const result = await resolveContentRoute(repo, 'ARTICLES', 'en', 'friendship-festival');
    expect(result.kind).toBe('canonical');
  });

  it('returns not-found for an unknown slug (404)', async () => {
    const repo = new InMemoryContentRepository();
    const result = await resolveContentRoute(repo, 'ARTICLES', 'en', 'does-not-exist');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('redirects an old slug to the current canonical URL in a single hop, never a chain', async () => {
    const repo = new InMemoryContentRepository();
    const translation = makeTranslation();

    // Simulate three generations of slug changes via setCanonicalRoute, the
    // way an editorial "change slug" command would.
    await repo.setCanonicalRoute({
      translationId: translation.id,
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'v1-slug',
    });
    await repo.setCanonicalRoute({
      translationId: translation.id,
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'v2-slug',
    });
    const finalRoute = await repo.setCanonicalRoute({
      translationId: translation.id,
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'v3-slug',
    });
    repo.seed({
      ...makeContent(),
      translations: [{ ...translation, routes: [] }],
    });

    const fromOldest = await resolveContentRoute(repo, 'ARTICLES', 'en', 'v1-slug');
    expect(fromOldest).toEqual({ kind: 'redirect', canonicalUrl: '/en/articles/v3-slug' });

    const fromMiddle = await resolveContentRoute(repo, 'ARTICLES', 'en', 'v2-slug');
    expect(fromMiddle).toEqual({
      kind: 'redirect',
      canonicalUrl: `/en/articles/${finalRoute.slug}`,
    });

    const fromCurrent = await resolveContentRoute(repo, 'ARTICLES', 'en', 'v3-slug');
    expect(fromCurrent.kind).toBe('canonical');
  });

  it('rejects a slug collision with the currently canonical route', async () => {
    const repo = new InMemoryContentRepository();
    await repo.setCanonicalRoute({
      translationId: 'translation-a',
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'taken-slug',
    });
    await expect(
      repo.setCanonicalRoute({
        translationId: 'translation-b',
        locale: 'en',
        namespace: 'ARTICLES',
        slug: 'taken-slug',
      }),
    ).rejects.toThrow(SlugConflictError);
  });

  it('treats unpublished content as not-found even though its canonical route exists', async () => {
    const repo = new InMemoryContentRepository();
    const translation = makeTranslation();
    repo.seed({
      ...makeContent({ status: 'DRAFT' }),
      translations: [
        {
          ...translation,
          routes: [
            {
              id: 'r1',
              translationId: translation.id,
              locale: 'en',
              namespace: 'ARTICLES',
              slug: 'friendship-festival',
              isCanonical: true,
              createdAt: new Date(),
            },
          ],
        },
      ],
    });

    const result = await resolveContentRoute(repo, 'ARTICLES', 'en', 'friendship-festival');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('returns retired (410), not not-found (404), for a durably retired content item', async () => {
    const repo = new InMemoryContentRepository();
    const translation = makeTranslation();
    repo.seed({
      ...makeContent({
        status: 'ARCHIVED',
        retiredAt: new Date('2026-08-03T00:00:00Z'),
        retirementReason: 'Discontinued, no successor.',
      }),
      translations: [
        {
          ...translation,
          routes: [
            {
              id: 'r1',
              translationId: translation.id,
              locale: 'en',
              namespace: 'ARTICLES',
              slug: 'friendship-festival',
              isCanonical: true,
              createdAt: new Date(),
            },
          ],
        },
      ],
    });

    const result = await resolveContentRoute(repo, 'ARTICLES', 'en', 'friendship-festival');
    expect(result).toEqual({ kind: 'retired', retirementReason: 'Discontinued, no successor.' });
  });

  it('throws CanonicalRouteMissingError if the canonical route points at a translation the content no longer has (data-integrity guard, not a normal 404)', async () => {
    const translation = makeTranslation({ id: 'orphan-translation' });
    const canonicalRoute: ContentRoute = {
      id: 'r1',
      translationId: translation.id,
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'friendship-festival',
      isCanonical: true,
      createdAt: new Date(),
    };
    // The route table has a canonical route, but findByCanonicalSlug (as a
    // real repository would after a botched cascade) returns content whose
    // translations array no longer includes the translation that route
    // belongs to.
    const brokenRepo: ContentRepository = {
      findById: () => Promise.resolve(undefined),
      findByCanonicalSlug: () =>
        Promise.resolve({ ...makeContent(), translations: [] } satisfies ContentWithTranslations),
      findRouteBySlug: () => Promise.resolve(canonicalRoute),
      findCanonicalRouteByTranslationId: () => Promise.resolve(canonicalRoute),
      create: () => {
        throw new Error('not needed for this test');
      },
      addTranslation: () => {
        throw new Error('not needed for this test');
      },
      updateTranslation: () => {
        throw new Error('not needed for this test');
      },
      setCanonicalRoute: () => {
        throw new Error('not needed for this test');
      },
      listPublished: () => Promise.resolve([]),
      updateStatus: () => {
        throw new Error('not needed for this test');
      },
      retire: () => {
        throw new Error('not needed for this test');
      },
      listAll: () => {
        throw new Error('not needed for this test');
      },
    };

    await expect(
      resolveContentRoute(brokenRepo, 'ARTICLES', 'en', 'friendship-festival'),
    ).rejects.toThrow(CanonicalRouteMissingError);
  });
});

class InMemoryProductRepository implements ProductRepository {
  constructor(
    private readonly product: (Product & { translations: ProductTranslation[] }) | undefined,
  ) {}

  findById(): Promise<(Product & { translations: ProductTranslation[] }) | undefined> {
    return Promise.resolve(this.product);
  }

  findByPublicId(
    publicId: string,
  ): Promise<(Product & { translations: ProductTranslation[] }) | undefined> {
    return Promise.resolve(this.product?.publicId === publicId ? this.product : undefined);
  }

  findBySku(): Promise<(Product & { translations: ProductTranslation[] }) | undefined> {
    return Promise.resolve(undefined);
  }

  create(): Promise<Product & { translations: ProductTranslation[] }> {
    throw new Error('not needed for these tests');
  }

  addTranslation(): Promise<Product & { translations: ProductTranslation[] }> {
    throw new Error('not needed for these tests');
  }

  updateTranslation(): Promise<Product & { translations: ProductTranslation[] }> {
    throw new Error('not needed for these tests');
  }

  updateStatus(): Promise<Product & { translations: ProductTranslation[] }> {
    throw new Error('not needed for these tests');
  }

  retire(): Promise<Product & { translations: ProductTranslation[] }> {
    throw new Error('not needed for these tests');
  }

  listPublished(): Promise<CursorPage<Product & { translations: ProductTranslation[] }>> {
    return Promise.resolve({
      data: this.product ? [this.product] : [],
      page: { hasMore: false },
    });
  }

  listAll(): Promise<CursorPage<Product & { translations: ProductTranslation[] }>> {
    throw new Error('not needed for these tests');
  }
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    publicId: 'P8K4F2M9',
    sku: 'SKU-1',
    categoryId: 'category-1',
    status: 'PUBLISHED',
    directSaleEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function makeProductTranslation(overrides: Partial<ProductTranslation> = {}): ProductTranslation {
  return {
    id: 'pt-1',
    productId: 'product-1',
    locale: 'en',
    name: 'Red T-shirt',
    slug: 'red-t-shirt',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

describe('resolveProductRoute', () => {
  it('resolves the canonical product route when the slug matches', async () => {
    const repo = new InMemoryProductRepository({
      ...makeProduct(),
      translations: [makeProductTranslation()],
    });
    const result = await resolveProductRoute(repo, 'P8K4F2M9', 'en', 'red-t-shirt');
    expect(result.kind).toBe('canonical');
  });

  it('redirects a stale slug to the current canonical URL, resolving by publicId', async () => {
    const repo = new InMemoryProductRepository({
      ...makeProduct(),
      translations: [makeProductTranslation({ slug: 'red-t-shirt-v2' })],
    });
    const result = await resolveProductRoute(repo, 'P8K4F2M9', 'en', 'red-t-shirt-old');
    expect(result).toEqual({
      kind: 'redirect',
      canonicalUrl: '/en/catalog/P8K4F2M9-red-t-shirt-v2',
    });
  });

  it('returns not-found for an unknown publicId', async () => {
    const repo = new InMemoryProductRepository(undefined);
    const result = await resolveProductRoute(repo, 'UNKNOWN1', 'en', 'anything');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('returns not-found for an unpublished product', async () => {
    const repo = new InMemoryProductRepository({
      ...makeProduct({ status: 'DRAFT' }),
      translations: [makeProductTranslation()],
    });
    const result = await resolveProductRoute(repo, 'P8K4F2M9', 'en', 'red-t-shirt');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('returns retired (410), not not-found (404), for a durably retired product', async () => {
    const repo = new InMemoryProductRepository({
      ...makeProduct({
        status: 'ARCHIVED',
        retiredAt: new Date('2026-08-03T00:00:00Z'),
        retirementReason: 'Discontinued by manufacturer.',
      }),
      translations: [makeProductTranslation()],
    });
    const result = await resolveProductRoute(repo, 'P8K4F2M9', 'en', 'red-t-shirt');
    expect(result).toEqual({ kind: 'retired', retirementReason: 'Discontinued by manufacturer.' });
  });

  it('returns not-found when the product has no translation for the requested locale', async () => {
    const repo = new InMemoryProductRepository({
      ...makeProduct(),
      translations: [makeProductTranslation({ locale: 'ru', slug: 'krasnaya-futbolka' })],
    });
    const result = await resolveProductRoute(repo, 'P8K4F2M9', 'en', 'red-t-shirt');
    expect(result).toEqual({ kind: 'not-found' });
  });
});

describe('CanonicalRouteMissingError', () => {
  it('is thrown when a historical route points at a translation with no canonical route at all (data-integrity guard, not a normal 404)', async () => {
    const translation = makeTranslation();
    const historicalRoute: ContentRoute = {
      id: 'r1',
      translationId: translation.id,
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'orphaned',
      isCanonical: false,
      createdAt: new Date(),
    };
    const brokenRepo: ContentRepository = {
      findById: () => Promise.resolve(undefined),
      findByCanonicalSlug: () => Promise.resolve(undefined),
      findRouteBySlug: () => Promise.resolve(historicalRoute),
      findCanonicalRouteByTranslationId: () => Promise.resolve(undefined),
      create: () => {
        throw new Error('not needed for this test');
      },
      addTranslation: () => {
        throw new Error('not needed for this test');
      },
      updateTranslation: () => {
        throw new Error('not needed for this test');
      },
      setCanonicalRoute: () => {
        throw new Error('not needed for this test');
      },
      listPublished: () => Promise.resolve([]),
      updateStatus: () => {
        throw new Error('not needed for this test');
      },
      retire: () => {
        throw new Error('not needed for this test');
      },
      listAll: () => {
        throw new Error('not needed for this test');
      },
    };

    await expect(resolveContentRoute(brokenRepo, 'ARTICLES', 'en', 'orphaned')).rejects.toThrow(
      CanonicalRouteMissingError,
    );
  });
});
