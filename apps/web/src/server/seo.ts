import { buildAlternateLinks, type AlternateLinks } from '@eramix/application';
import type {
  CategoryWithTranslations,
  ContentWithTranslations,
  ProductWithTranslations,
} from '@eramix/application';
import { articleUrl, categoryUrl, pageUrl, productUrl, type LocaleCode } from '@eramix/domain';
import type { Metadata } from 'next';

function toMetadata(alternates: AlternateLinks): Metadata {
  return {
    alternates: {
      canonical: alternates.canonical,
      languages: { ...alternates.languages, 'x-default': alternates.xDefault },
    },
  };
}

export function categoryAlternates(
  locale: LocaleCode,
  category: CategoryWithTranslations,
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
  return toMetadata(buildAlternateLinks(locale, urls));
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
  return toMetadata(buildAlternateLinks(locale, urls));
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
  return toMetadata(buildAlternateLinks(locale, urls));
}
