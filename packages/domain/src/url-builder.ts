import { ValidationFailedError } from './errors.js';
import { isValidOrderNumber } from './order-number.js';
import { isValidPublicId } from './public-id.js';
import type { LocaleCode } from './locale.js';
import { normalizeSlug } from './slug.js';

// The single typed URL builder (CLAUDE.md: "Hand-built public URL strings
// are forbidden outside that package"). Placed in packages/domain rather
// than a new top-level package: it is pure, zero-dependency policy code
// (the canonical URL grammar), and every layer (delivery, contracts,
// infrastructure/email, tests) already depends on packages/domain — a new
// package would need its own ADR for no behavioural benefit.
//
// Each function asserts its slug/publicId/orderNumber argument is already
// in normalized/valid form rather than silently re-normalizing it: a
// canonical URL is built from an already-persisted, already-validated
// value, so a mismatch here means a real bug upstream, not something to
// paper over.

function assertNormalizedSlug(slug: string): string {
  if (normalizeSlug(slug) !== slug) {
    throw new ValidationFailedError(`Slug "${slug}" is not in normalized form.`, { slug });
  }
  return slug;
}

export interface ArticleUrlParams {
  readonly locale: LocaleCode;
  readonly slug: string;
}

export function articleUrl({ locale, slug }: ArticleUrlParams): string {
  return `/${locale}/articles/${assertNormalizedSlug(slug)}`;
}

export interface PageUrlParams {
  readonly locale: LocaleCode;
  readonly slug: string;
}

export function pageUrl({ locale, slug }: PageUrlParams): string {
  return `/${locale}/pages/${assertNormalizedSlug(slug)}`;
}

export interface CategoryUrlParams {
  readonly locale: LocaleCode;
  readonly slug: string;
}

export function categoryUrl({ locale, slug }: CategoryUrlParams): string {
  return `/${locale}/catalog/${assertNormalizedSlug(slug)}`;
}

export interface ProductUrlParams {
  readonly locale: LocaleCode;
  readonly publicId: string;
  readonly slug: string;
}

/** Resolution is always by publicId; the slug segment is cosmetic/SEO only. */
export function productUrl({ locale, publicId, slug }: ProductUrlParams): string {
  if (!isValidPublicId(publicId)) {
    throw new ValidationFailedError(`"${publicId}" is not a valid product publicId.`, {
      publicId,
    });
  }
  return `/${locale}/catalog/${publicId}-${assertNormalizedSlug(slug)}`;
}

export interface OrderUrlParams {
  readonly locale: LocaleCode;
  readonly orderNumber: string;
}

/** Protected route — this only builds the path; authorization is enforced server-side (CLAUDE.md). */
export function orderUrl({ locale, orderNumber }: OrderUrlParams): string {
  if (!isValidOrderNumber(orderNumber)) {
    throw new ValidationFailedError(`"${orderNumber}" is not a valid order number.`, {
      orderNumber,
    });
  }
  return `/${locale}/account/orders/${orderNumber}`;
}
