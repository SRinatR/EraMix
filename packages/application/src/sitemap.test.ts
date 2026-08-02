import type {
  CategoryWithTranslations,
  ContentWithTranslations,
  ProductWithTranslations,
} from './repositories.js';
import { describe, expect, it } from 'vitest';
import { buildSitemapEntries } from './sitemap.js';

const publishedArticle: ContentWithTranslations = {
  id: 'content-1',
  type: 'ARTICLE',
  status: 'PUBLISHED',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  version: 0,
  translations: [
    {
      id: 'translation-1',
      contentId: 'content-1',
      locale: 'en',
      title: 'Spring festival',
      content: {},
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 0,
      routes: [
        {
          id: 'route-1',
          translationId: 'translation-1',
          locale: 'en',
          namespace: 'ARTICLES',
          slug: 'spring-festival',
          isCanonical: true,
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'route-0',
          translationId: 'translation-1',
          locale: 'en',
          namespace: 'ARTICLES',
          slug: 'spring-festival-old',
          isCanonical: false,
          createdAt: new Date('2025-12-01'),
        },
      ],
    },
  ],
};

const publishedCategory: CategoryWithTranslations = {
  id: 'category-1',
  status: 'PUBLISHED',
  sortOrder: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-03'),
  version: 0,
  translations: [
    {
      id: 'cat-translation-1',
      categoryId: 'category-1',
      locale: 'en',
      name: 'Costumes',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 0,
      routes: [
        {
          id: 'cat-route-1',
          translationId: 'cat-translation-1',
          locale: 'en',
          slug: 'costumes',
          isCanonical: true,
          createdAt: new Date('2026-01-01'),
        },
      ],
    },
  ],
};

const publishedProduct: ProductWithTranslations = {
  id: 'product-1',
  publicId: 'P8K4F2M9',
  sku: 'SKU-1',
  categoryId: 'category-1',
  status: 'PUBLISHED',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-04'),
  version: 0,
  translations: [
    {
      id: 'pt-1',
      productId: 'product-1',
      locale: 'en',
      name: 'Red T-shirt',
      slug: 'red-t-shirt',
      version: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
  ],
};

function fakeRepositories() {
  return {
    content: {
      listPublished: (type: 'ARTICLE' | 'PAGE' | 'FAQ_ITEM') =>
        Promise.resolve(type === 'ARTICLE' ? [publishedArticle] : []),
    },
    category: {
      listPublished: () => Promise.resolve([publishedCategory]),
    },
    product: {
      listPublished: (input: { cursor?: string }) =>
        Promise.resolve(
          input.cursor === undefined
            ? { data: [publishedProduct], page: { hasMore: false } }
            : { data: [], page: { hasMore: false } },
        ),
    },
  } as unknown as Parameters<typeof buildSitemapEntries>[0];
}

describe('buildSitemapEntries', () => {
  it('includes only canonical routes of published articles, categories, and products', async () => {
    const entries = await buildSitemapEntries(fakeRepositories());

    expect(entries).toEqual(
      expect.arrayContaining([
        { url: '/en/articles/spring-festival', lastModified: publishedArticle.updatedAt },
        { url: '/en/catalog/costumes', lastModified: publishedCategory.updatedAt },
        {
          url: '/en/catalog/P8K4F2M9-red-t-shirt',
          lastModified: publishedProduct.updatedAt,
        },
      ]),
    );
    // The demoted historical route must never appear.
    expect(entries.some((entry) => entry.url.includes('spring-festival-old'))).toBe(false);
    expect(entries).toHaveLength(3);
  });
});
