import type {
  CategoryWithTranslations,
  ContentWithTranslations,
  ProductWithTranslations,
} from '@eramix/application';
import type {
  CategoryRoute,
  CategoryTranslation,
  ContentRoute,
  ContentTranslation,
  ProductTranslation,
} from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import {
  categoryAlternates,
  contentAlternates,
  productAlternates,
  staticPageAlternates,
} from './seo';

function makeCategoryRoute(overrides: Partial<CategoryRoute> = {}): CategoryRoute {
  return {
    id: 'route-1',
    translationId: 'translation-1',
    locale: 'en',
    slug: 'widgets',
    isCanonical: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCategory(
  translations: readonly (CategoryTranslation & { routes: readonly CategoryRoute[] })[],
): CategoryWithTranslations {
  return {
    id: 'category-1',
    status: 'PUBLISHED',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations,
  };
}

function makeProduct(translations: readonly ProductTranslation[]): ProductWithTranslations {
  return {
    id: 'product-1',
    publicId: 'ABCDEFGH',
    sku: 'SKU-1',
    categoryId: 'category-1',
    status: 'PUBLISHED',
    directSaleEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations,
  };
}

function makeContentRoute(overrides: Partial<ContentRoute> = {}): ContentRoute {
  return {
    id: 'route-1',
    translationId: 'translation-1',
    locale: 'en',
    namespace: 'ARTICLES',
    slug: 'launch-day',
    isCanonical: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeContent(
  type: ContentWithTranslations['type'],
  translations: readonly (ContentTranslation & { routes: readonly ContentRoute[] })[],
): ContentWithTranslations {
  return {
    id: 'content-1',
    type,
    status: 'PUBLISHED',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations,
  };
}

describe('categoryAlternates', () => {
  it('surfaces seoTitle/seoDescription into title/description/openGraph', () => {
    const translation: CategoryTranslation & { routes: readonly CategoryRoute[] } = {
      id: 'translation-1',
      categoryId: 'category-1',
      locale: 'en',
      name: 'Widgets',
      seoTitle: 'Buy widgets online | EraMix',
      seoDescription: 'Browse our full range of widgets.',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [makeCategoryRoute()],
    };
    const metadata = categoryAlternates('en', makeCategory([translation]));

    expect(metadata.title).toBe('Buy widgets online | EraMix');
    expect(metadata.description).toBe('Browse our full range of widgets.');
    expect(metadata.alternates?.canonical).toBe('/en/catalog/widgets');
    expect(metadata.openGraph).toMatchObject({
      title: 'Buy widgets online | EraMix',
      description: 'Browse our full range of widgets.',
      type: 'website',
    });
  });

  it('falls back to the display name when seoTitle is absent (unpublished-preview case)', () => {
    const translation: CategoryTranslation & { routes: readonly CategoryRoute[] } = {
      id: 'translation-1',
      categoryId: 'category-1',
      locale: 'en',
      name: 'Widgets',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [makeCategoryRoute()],
    };
    const metadata = categoryAlternates('en', makeCategory([translation]));
    expect(metadata.title).toBe('Widgets');
    expect(metadata.description).toBeUndefined();
  });

  it('builds a complete reciprocal hreflang cluster with x-default', () => {
    const en: CategoryTranslation & { routes: readonly CategoryRoute[] } = {
      id: 't-en',
      categoryId: 'category-1',
      locale: 'en',
      name: 'Widgets',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [makeCategoryRoute({ translationId: 't-en', slug: 'widgets' })],
    };
    const ru: CategoryTranslation & { routes: readonly CategoryRoute[] } = {
      id: 't-ru',
      categoryId: 'category-1',
      locale: 'ru',
      name: 'Виджеты',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [makeCategoryRoute({ translationId: 't-ru', locale: 'ru', slug: 'vidzhety' })],
    };
    const metadata = categoryAlternates('ru', makeCategory([en, ru]));

    expect(metadata.alternates?.canonical).toBe('/ru/catalog/vidzhety');
    expect(metadata.alternates?.languages).toMatchObject({
      en: '/en/catalog/widgets',
      ru: '/ru/catalog/vidzhety',
      'x-default': '/en/catalog/widgets',
    });
  });

  it('never includes a translation with no canonical route in the hreflang cluster', () => {
    const en: CategoryTranslation & { routes: readonly CategoryRoute[] } = {
      id: 't-en',
      categoryId: 'category-1',
      locale: 'en',
      name: 'Widgets',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [makeCategoryRoute({ translationId: 't-en', slug: 'widgets' })],
    };
    const uzWithoutRoute: CategoryTranslation & { routes: readonly CategoryRoute[] } = {
      id: 't-uz',
      categoryId: 'category-1',
      locale: 'uz',
      name: 'Vidjetlar',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [],
    };
    const metadata = categoryAlternates('en', makeCategory([en, uzWithoutRoute]));
    expect(metadata.alternates?.languages).not.toHaveProperty('uz');
  });
});

describe('productAlternates', () => {
  it('surfaces seoTitle/seoDescription and falls back to sku when both name/seoTitle are absent', () => {
    const translation: ProductTranslation = {
      id: 'translation-1',
      productId: 'product-1',
      locale: 'en',
      name: 'Blue Widget',
      slug: 'blue-widget',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
    };
    const metadata = productAlternates('en', makeProduct([translation]));
    expect(metadata.title).toBe('Blue Widget');
    expect(metadata.alternates?.canonical).toBe('/en/catalog/ABCDEFGH-blue-widget');
    // Never emits an Offer/price — search-visibility runbook: indicative
    // "from" pricing must never look like a real Offer/price claim.
    expect(metadata.openGraph).not.toHaveProperty('offers');
  });
});

describe('contentAlternates', () => {
  it('uses openGraph type "article" for ARTICLE content, "website" for PAGE', () => {
    const translation: ContentTranslation & { routes: readonly ContentRoute[] } = {
      id: 'translation-1',
      contentId: 'content-1',
      locale: 'en',
      title: 'Launch day',
      content: 'We shipped it.',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      routes: [makeContentRoute()],
    };
    const article = contentAlternates('en', makeContent('ARTICLE', [translation]));
    expect(article.openGraph).toMatchObject({ type: 'article' });

    const page = contentAlternates(
      'en',
      makeContent('PAGE', [{ ...translation, routes: [makeContentRoute({ namespace: 'PAGES' })] }]),
    );
    expect(page.openGraph).toMatchObject({ type: 'website' });
  });
});

describe('staticPageAlternates', () => {
  it('builds canonical/hreflang/x-default for every supported locale from a fixed path', () => {
    const metadata = staticPageAlternates('en', '/catalog', { title: 'Catalog' });
    expect(metadata.alternates?.canonical).toBe('/en/catalog');
    expect(metadata.alternates?.languages).toEqual({
      en: '/en/catalog',
      ru: '/ru/catalog',
      uz: '/uz/catalog',
      'x-default': '/en/catalog',
    });
  });

  it('the home path canonical is locale-specific, never the bare "/" regardless of the requested locale', () => {
    const en = staticPageAlternates('en', '', { title: 'EraMix' });
    const ru = staticPageAlternates('ru', '', { title: 'EraMix' });
    expect(en.alternates?.canonical).toBe('/en');
    expect(ru.alternates?.canonical).toBe('/ru');
  });
});
