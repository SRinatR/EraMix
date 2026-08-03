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
  /**
   * Durable retirement (CLAUDE.md) — never emitted for a merely-unpublished/
   * missing/DRAFT item, only when retiredAt is set. `successorCanonicalUrl`
   * is present only when the retired entity names a successor AND that
   * successor is, right now, a real published entity with a resolvable
   * canonical URL for this locale (search-visibility.md: "a 308 is used only
   * for a materially equivalent canonical replacement") — re-checked live on
   * every request, never frozen at retirement time, so a successor that is
   * later itself unpublished/retired simply falls back to a plain 410.
   */
  | {
      readonly kind: 'retired';
      readonly retirementReason: string | undefined;
      readonly successorCanonicalUrl?: string | undefined;
    };

/** One-hop only: does not follow the successor's own successor, even if it has one. */
async function resolveContentSuccessorUrl(
  repository: ContentRepository,
  successorId: string,
  locale: LocaleCode,
): Promise<string | undefined> {
  const successor = await repository.findById(successorId);
  if (!successor || successor.status !== 'PUBLISHED' || successor.retiredAt !== undefined) {
    return undefined;
  }
  const translation = successor.translations.find((entry) => entry.locale === locale);
  const canonicalRoute = translation?.routes.find((route) => route.isCanonical);
  if (!translation || !canonicalRoute) {
    return undefined;
  }
  return successor.type === 'ARTICLE'
    ? articleUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug })
    : successor.type === 'PAGE'
      ? pageUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug })
      : undefined; // FAQ_ITEM has no per-item canonical URL (TZ Appendix F.3).
}

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
    const successorCanonicalUrl =
      content.successorId !== undefined
        ? await resolveContentSuccessorUrl(repository, content.successorId, locale)
        : undefined;
    return { kind: 'retired', retirementReason: content.retirementReason, successorCanonicalUrl };
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
  /** Durable retirement (CLAUDE.md) — see ContentRouteResolution's matching member for the successorCanonicalUrl contract. */
  | {
      readonly kind: 'retired';
      readonly retirementReason: string | undefined;
      readonly successorCanonicalUrl?: string | undefined;
    };

/** One-hop only: does not follow the successor's own successor, even if it has one. */
async function resolveCategorySuccessorUrl(
  repository: CategoryRepository,
  successorId: string,
  locale: LocaleCode,
): Promise<string | undefined> {
  const successor = await repository.findById(successorId);
  if (!successor || successor.status !== 'PUBLISHED' || successor.retiredAt !== undefined) {
    return undefined;
  }
  const translation = successor.translations.find((entry) => entry.locale === locale);
  const canonicalRoute = translation?.routes.find((route) => route.isCanonical);
  if (!translation || !canonicalRoute) {
    return undefined;
  }
  return categoryUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug });
}

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
    const successorCanonicalUrl =
      category.successorId !== undefined
        ? await resolveCategorySuccessorUrl(repository, category.successorId, locale)
        : undefined;
    return {
      kind: 'retired',
      retirementReason: category.retirementReason,
      successorCanonicalUrl,
    };
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
  /** Durable retirement (CLAUDE.md) — see ContentRouteResolution's matching member for the successorCanonicalUrl contract. */
  | {
      readonly kind: 'retired';
      readonly retirementReason: string | undefined;
      readonly successorCanonicalUrl?: string | undefined;
    };

/**
 * One-hop only: does not follow the successor's own successor. Products
 * have no separate route table (ADR-0010 — resolution is always by
 * publicId), so unlike Category/Content this only needs the successor's own
 * translation, never a canonical-route lookup.
 */
async function resolveProductSuccessorUrl(
  repository: ProductRepository,
  successorId: string,
  locale: LocaleCode,
): Promise<string | undefined> {
  const successor = await repository.findById(successorId);
  if (!successor || successor.status !== 'PUBLISHED' || successor.retiredAt !== undefined) {
    return undefined;
  }
  const translation = successor.translations.find((entry) => entry.locale === locale);
  if (!translation) {
    return undefined;
  }
  return productUrl({ locale, publicId: successor.publicId, slug: translation.slug });
}

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
    const successorCanonicalUrl =
      product.successorId !== undefined
        ? await resolveProductSuccessorUrl(repository, product.successorId, locale)
        : undefined;
    return {
      kind: 'retired',
      retirementReason: product.retirementReason,
      successorCanonicalUrl,
    };
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
