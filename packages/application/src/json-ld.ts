import type {
  CategoryTranslation,
  Content,
  ContentTranslation,
  Product,
  ProductTranslation,
} from '@eramix/domain';

/**
 * Page-level JSON-LD builders (CLAUDE.md: "JSON-LD is emitted only from
 * real published facts; no fabricated Organization, price, availability or
 * Offer data"). Framework-free, pure data transforms — apps/web renders
 * whatever these return through <JsonLd> and never composes the object
 * literal itself, mirroring settings.ts's buildOrganizationJsonLd.
 */

export interface ProductJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Product';
  readonly name: string;
  readonly sku: string;
  readonly description?: string;
}

/**
 * Deliberately no `offers`/price block (ADR-0005): the quote-only indicative
 * price is explicitly non-binding, and an `Offer`/price in structured data
 * risks a search engine treating it as a real, transactable price. A real
 * `Offer` (ADR-0019) only ever emits through merchant-feed.ts's
 * buildProductOfferJsonLd, gated on real eligibility — never through this
 * page-rendering path.
 */
export function buildProductJsonLd(
  product: Pick<Product, 'sku'>,
  translation: Pick<ProductTranslation, 'name' | 'description'>,
): ProductJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: translation.name,
    sku: product.sku,
    ...(translation.description !== undefined ? { description: translation.description } : {}),
  };
}

export interface CollectionPageJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'CollectionPage';
  readonly name: string;
}

export function buildCollectionPageJsonLd(
  translation: Pick<CategoryTranslation, 'name'>,
): CollectionPageJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: translation.name,
  };
}

export interface ArticleJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Article';
  readonly headline: string;
  readonly description?: string;
  readonly inLanguage: string;
  readonly datePublished?: string;
  readonly dateModified: string;
}

export function buildArticleJsonLd(
  content: Pick<Content, 'publishedAt'>,
  translation: Pick<ContentTranslation, 'title' | 'summary' | 'locale' | 'updatedAt'>,
): ArticleJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: translation.title,
    ...(translation.summary !== undefined ? { description: translation.summary } : {}),
    inLanguage: translation.locale,
    ...(content.publishedAt !== undefined
      ? { datePublished: content.publishedAt.toISOString() }
      : {}),
    dateModified: translation.updatedAt.toISOString(),
  };
}

export interface WebPageJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'WebPage';
  readonly name: string;
  readonly description?: string;
  readonly inLanguage: string;
}

export function buildWebPageJsonLd(
  translation: Pick<ContentTranslation, 'title' | 'summary' | 'locale'>,
): WebPageJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: translation.title,
    ...(translation.summary !== undefined ? { description: translation.summary } : {}),
    inLanguage: translation.locale,
  };
}

export interface FaqPageJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'FAQPage';
  readonly mainEntity: readonly {
    readonly '@type': 'Question';
    readonly name: string;
    readonly acceptedAnswer: { readonly '@type': 'Answer'; readonly text: string };
  }[];
}

/**
 * `undefined` (never an empty `mainEntity: []`) when there are no visible,
 * maintained FAQ entries — CLAUDE.md: "FAQPage is emitted only for visible
 * maintained FAQs," never a promise of content that is not actually shown.
 * `answerText` is pre-rendered by the caller (apps/web's own
 * content-body.tsx paragraph formatting) so this stays a pure
 * domain/application transform with no UI-layer dependency.
 */
export function buildFaqPageJsonLd(
  items: readonly { readonly title: string; readonly answerText: string }[],
): FaqPageJsonLd | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.title,
      acceptedAnswer: { '@type': 'Answer', text: item.answerText },
    })),
  };
}
