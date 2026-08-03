import { buildAlternateLinks, type AlternateLinks } from '@eramix/application';
import type {
  CategoryWithTranslations,
  ContentWithTranslations,
  ProductWithTranslations,
} from '@eramix/application';
import {
  articleUrl,
  categoryUrl,
  pageUrl,
  productUrl,
  SUPPORTED_LOCALES,
  type LocaleCode,
} from '@eramix/domain';
import type { Metadata } from 'next';

interface SeoContent {
  readonly title: string;
  readonly description?: string;
}

/**
 * Surfaces the editorially-required `seoTitle`/`seoDescription` (the
 * publication gate — packages/application/src/publication.ts — refuses to
 * publish a translation missing either) into the actual rendered
 * `<title>`/meta description/Open Graph tags. Falling back to the display
 * name/title only covers the theoretical case of an unpublished preview
 * render; a real PUBLISHED page always has both.
 */
function toMetadata(
  alternates: AlternateLinks,
  content: SeoContent,
  ogType: 'website' | 'article' = 'website',
  overrides?: { readonly canonical?: string; readonly robots?: Metadata['robots'] },
): Metadata {
  const canonical = overrides?.canonical ?? alternates.canonical;
  return {
    title: content.title,
    ...(content.description !== undefined ? { description: content.description } : {}),
    alternates: {
      canonical,
      languages: { ...alternates.languages, 'x-default': alternates.xDefault },
    },
    ...(overrides?.robots !== undefined ? { robots: overrides.robots } : {}),
    openGraph: {
      title: content.title,
      ...(content.description !== undefined ? { description: content.description } : {}),
      url: canonical,
      type: ogType,
    },
  };
}

/**
 * The query-parameter SEO policy for a public collection listing
 * (docs/runbooks/search-visibility.md, "robots.txt and query parameters"):
 * a non-empty `search` is a content-filtering variant — `noindex,follow`,
 * canonicalized to the unparameterized collection (the base `alternates`
 * already is that URL, so no canonical override is needed, only the robots
 * directive). Cursor/limit pagination with no search is "a paginated series
 * with a substantively different product list" — crawlable and
 * self-canonical (its own URL, including the pagination query string), never
 * folded into page 1's canonical. Neither present (bare page 1) is
 * unaffected — same behaviour as before this policy existed.
 */
export interface CollectionQueryVariant {
  readonly search?: string | undefined;
  readonly pagination?: { readonly cursor?: string; readonly limit?: number } | undefined;
}

function collectionOverrides(
  canonicalBase: string,
  variant: CollectionQueryVariant | undefined,
): { readonly canonical?: string; readonly robots?: Metadata['robots'] } | undefined {
  if (!variant) {
    return undefined;
  }
  if (variant.search !== undefined && variant.search.length > 0) {
    return { robots: { index: false, follow: true } };
  }
  const { cursor, limit } = variant.pagination ?? {};
  if (cursor === undefined && limit === undefined) {
    return undefined;
  }
  const query = new URLSearchParams();
  if (cursor !== undefined) {
    query.set('cursor', cursor);
  }
  if (limit !== undefined) {
    query.set('limit', String(limit));
  }
  return {
    canonical: `${canonicalBase}?${query.toString()}`,
    robots: { index: true, follow: true },
  };
}

export function categoryAlternates(
  locale: LocaleCode,
  category: CategoryWithTranslations,
  queryVariant?: CollectionQueryVariant,
): Metadata {
  const urls = new Map<LocaleCode, string>();
  for (const translation of category.translations) {
    const canonicalRoute = translation.routes.find((route) => route.isCanonical);
    if (canonicalRoute) {
      urls.set(
        translation.locale,
        categoryUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug }),
      );
    }
  }
  const current = category.translations.find((t) => t.locale === locale);
  const alternates = buildAlternateLinks(locale, urls);
  return toMetadata(
    alternates,
    {
      title: current?.seoTitle ?? current?.name ?? category.id,
      ...(current?.seoDescription !== undefined ? { description: current.seoDescription } : {}),
    },
    'website',
    collectionOverrides(alternates.canonical, queryVariant),
  );
}

export function productAlternates(locale: LocaleCode, product: ProductWithTranslations): Metadata {
  const urls = new Map<LocaleCode, string>();
  for (const translation of product.translations) {
    urls.set(
      translation.locale,
      productUrl({
        locale: translation.locale,
        publicId: product.publicId,
        slug: translation.slug,
      }),
    );
  }
  const current = product.translations.find((t) => t.locale === locale);
  return toMetadata(buildAlternateLinks(locale, urls), {
    title: current?.seoTitle ?? current?.name ?? product.sku,
    ...(current?.seoDescription !== undefined ? { description: current.seoDescription } : {}),
  });
}

export function contentAlternates(locale: LocaleCode, content: ContentWithTranslations): Metadata {
  const urls = new Map<LocaleCode, string>();
  for (const translation of content.translations) {
    const canonicalRoute = translation.routes.find((route) => route.isCanonical);
    if (canonicalRoute) {
      const url =
        content.type === 'ARTICLE'
          ? articleUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug })
          : pageUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug });
      urls.set(translation.locale, url);
    }
  }
  const current = content.translations.find((t) => t.locale === locale);
  return toMetadata(
    buildAlternateLinks(locale, urls),
    {
      title: current?.seoTitle ?? current?.title ?? content.id,
      ...(current?.seoDescription !== undefined ? { description: current.seoDescription } : {}),
    },
    content.type === 'ARTICLE' ? 'article' : 'website',
  );
}

/**
 * Fixed-path system routes (catalog/articles/FAQ index, home) — same
 * canonical/hreflang/x-default policy as entity pages, but every locale
 * shares the identical path shape (no editorial slug to resolve), so no
 * repository lookup is needed.
 */
export function staticPageAlternates(
  locale: LocaleCode,
  path: '' | '/catalog' | '/articles' | '/faq',
  content: SeoContent,
): Metadata {
  const urls = new Map<LocaleCode, string>(
    SUPPORTED_LOCALES.map((l) => [l, `/${l}${path}`] as const),
  );
  return toMetadata(buildAlternateLinks(locale, urls), content);
}
