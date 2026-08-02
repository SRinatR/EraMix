import { generateOpaqueId, isOpaqueId } from './opaque-id.js';

/** Matches the TZ Appendix F example format, e.g. "P8K4F2M9". */
export const PUBLIC_ID_LENGTH = 8;

export function generatePublicId(): string {
  return generateOpaqueId(PUBLIC_ID_LENGTH);
}

export function isValidPublicId(value: string): boolean {
  return isOpaqueId(value, PUBLIC_ID_LENGTH);
}

/**
 * Splits a `/{locale}/catalog/{slug}` path segment into a product's
 * `{publicId}-{slug}` shape (ADR-0010) — used to disambiguate a category
 * route (plain slug) from a product route (publicId-prefixed) before
 * resolution. Shared by apps/web's catalog page and proxy.ts (ADR-0018) so
 * the two never drift.
 */
export function splitCatalogSlug(slug: string): { publicId: string; rest: string } | undefined {
  if (slug.length <= PUBLIC_ID_LENGTH || slug[PUBLIC_ID_LENGTH] !== '-') {
    return undefined;
  }
  const publicId = slug.slice(0, PUBLIC_ID_LENGTH);
  if (!isValidPublicId(publicId)) {
    return undefined;
  }
  return { publicId, rest: slug.slice(PUBLIC_ID_LENGTH + 1) };
}
