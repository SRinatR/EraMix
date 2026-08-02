import {
  CanonicalRouteMissingError,
  articleUrl,
  categoryUrl,
  isValidPublicId,
  pageUrl,
  productUrl,
  type ContentRouteNamespace,
  type ContentTranslation,
  type LocaleCode,
  type CategoryTranslation,
  type ProductTranslation,
} from '@eramix/domain';
import type {
  CategoryRepository,
  CategoryWithTranslations,
  ContentRepository,
  ContentWithTranslations,
  ProductRepository,
  ProductWithTranslations,
} from './repositories.js';

/**
 * Route resolution use cases (Phase 2). These are the one-hop, no-chain
 * current/history/redirect/404 decisions CLAUDE.md and ADR-0010 require —
 * kept in packages/application because they orchestrate a repository port,
 * not because they hold persistence logic themselves. A historical route
 * always resolves to the *current* canonical route in a single step: once
 * `ContentRepository.setCanonicalRoute`/`CategoryRepository.setCanonicalRoute`
 * demotes a route it is never re-promoted, so following `isCanonical` from
 * any row always lands on the live canonical route, never on another alias.
 */

export type ContentRouteResolution =
  | {
      readonly kind: 'canonical';
      readonly content: ContentWithTranslations;
      readonly translation: ContentTranslation;
    }
  | { readonly kind: 'redirect'; readonly canonicalUrl: string }
  | { readonly kind: 'not-found' }
  /** Durable retirement (CLAUDE.md) — never emitted for a merely-unpublished/missing/DRAFT item, only when retiredAt is set. */
  | { readonly kind: 'retired'; readonly retirementReason: string | undefined };

export async function resolveContentRoute(
  repository: ContentRepository,
  namespace: ContentRouteNamespace,
  locale: LocaleCode,
  slug: string,
): Promise<ContentRouteResolution> {
  const route = await repository.findRouteBySlug(namespace, locale, slug);
  if (!route) {
    return { kind: 'not-found' };
  }

  if (!route.isCanonical) {
    const canonical = await repository.findCanonicalRouteByTranslationId(route.translationId);
    if (!canonical) {
      throw new CanonicalRouteMissingError(
        `Translation ${route.translationId} has a historical route but no canonical route.`,
        { translationId: route.translationId },
      );
    }
    const canonicalUrl =
      namespace === 'ARTICLES'
        ? articleUrl({ locale: canonical.locale, slug: canonical.slug })
        : pageUrl({ locale: canonical.locale, slug: canonical.slug });
    return { kind: 'redirect', canonicalUrl };
  }

  const content = await repository.findByCanonicalSlug(namespace, locale, slug);
  if (content?.retiredAt !== undefined) {
    return { kind: 'retired', retirementReason: content?.retirementReason };
  }
  if (!content || content.status !== 'PUBLISHED') {
    return { kind: 'not-found' };
  }
  const translation = content.translations.find((entry) => entry.locale === locale);
  if (!translation) {
    throw new CanonicalRouteMissingError(
      `Content ${content.id} has no ${locale} translation backing its own canonical route.`,
      { contentId: content.id, locale },
    );
  }
  return { kind: 'canonical', content, translation };
}

export type CategoryRouteResolution =
  | {
      readonly kind: 'canonical';
      readonly category: CategoryWithTranslations;
      readonly translation: CategoryTranslation;
    }
  | { readonly kind: 'redirect'; readonly canonicalUrl: string }
  | { readonly kind: 'not-found' }
  /** Durable retirement (CLAUDE.md) — never emitted for a merely-unpublished/missing/DRAFT item, only when retiredAt is set. */
  | { readonly kind: 'retired'; readonly retirementReason: string | undefined };

export async function resolveCategoryRoute(
  repository: CategoryRepository,
  locale: LocaleCode,
  slug: string,
): Promise<CategoryRouteResolution> {
  const route = await repository.findRouteBySlug(locale, slug);
  if (!route) {
    return { kind: 'not-found' };
  }

  if (!route.isCanonical) {
    const canonical = await repository.findCanonicalRouteByTranslationId(route.translationId);
    if (!canonical) {
      throw new CanonicalRouteMissingError(
        `Translation ${route.translationId} has a historical route but no canonical route.`,
        { translationId: route.translationId },
      );
    }
    return {
      kind: 'redirect',
      canonicalUrl: categoryUrl({ locale: canonical.locale, slug: canonical.slug }),
    };
  }

  const category = await repository.findByCanonicalSlug(locale, slug);
  if (category?.retiredAt !== undefined) {
    return { kind: 'retired', retirementReason: category?.retirementReason };
  }
  if (!category || category.status !== 'PUBLISHED') {
    return { kind: 'not-found' };
  }
  const translation = category.translations.find((entry) => entry.locale === locale);
  if (!translation) {
    throw new CanonicalRouteMissingError(
      `Category ${category.id} has no ${locale} translation backing its own canonical route.`,
      { categoryId: category.id, locale },
    );
  }
  return { kind: 'canonical', category, translation };
}

export type ProductRouteResolution =
  | {
      readonly kind: 'canonical';
      readonly product: ProductWithTranslations;
      readonly translation: ProductTranslation;
    }
  | { readonly kind: 'redirect'; readonly canonicalUrl: string }
  | { readonly kind: 'not-found' }
  /** Durable retirement (CLAUDE.md) — never emitted for a merely-unpublished/missing/DRAFT item, only when retiredAt is set. */
  | { readonly kind: 'retired'; readonly retirementReason: string | undefined };

/**
 * Resolution is always by publicId (ADR-0010); `requestedSlug` is only
 * checked for a mismatch, never for lookup — an unknown publicId is
 * 'not-found', a known publicId with a stale/wrong slug is 'redirect'.
 */
export async function resolveProductRoute(
  repository: ProductRepository,
  publicId: string,
  locale: LocaleCode,
  requestedSlug: string,
): Promise<ProductRouteResolution> {
  if (!isValidPublicId(publicId)) {
    return { kind: 'not-found' };
  }
  const product = await repository.findByPublicId(publicId);
  if (product?.retiredAt !== undefined) {
    return { kind: 'retired', retirementReason: product?.retirementReason };
  }
  if (!product || product.status !== 'PUBLISHED') {
    return { kind: 'not-found' };
  }
  const translation = product.translations.find((entry) => entry.locale === locale);
  if (!translation) {
    return { kind: 'not-found' };
  }
  if (translation.slug !== requestedSlug) {
    return {
      kind: 'redirect',
      canonicalUrl: productUrl({ locale, publicId, slug: translation.slug }),
    };
  }
  return { kind: 'canonical', product, translation };
}
