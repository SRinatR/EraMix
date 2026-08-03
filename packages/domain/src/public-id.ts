import { generateOpaqueId, isOpaqueId } from './opaque-id.js';

/**
 * ADR-0021: newly created products get a 16-character opaque Crockford
 * Base32 publicId (32^16 ≈ 1.2 × 10^24 keyspace) — up from the original
 * 8-character format (32^8 ≈ 1.1 × 10^12), which remains valid and
 * canonical forever for every product created before this change (never
 * rewritten, never deprecated). `LEGACY_PUBLIC_ID_LENGTH` documents that
 * historical format; both lengths, and only these two exact lengths, are
 * ever accepted anywhere a publicId is parsed or validated.
 */
export const PUBLIC_ID_LENGTH = 16;
/** Matches the TZ Appendix F example format, e.g. "P8K4F2M9" — never generated for a new product, always valid for an existing one. */
export const LEGACY_PUBLIC_ID_LENGTH = 8;

/**
 * Longest-first: this ordering is unambiguous, not merely convenient. The
 * `-` separator character is never a member of the Crockford alphabet
 * (packages/domain/src/opaque-id.ts), so a genuine `LEGACY_PUBLIC_ID_LENGTH`
 * id followed by `-` and a slug can never also satisfy the
 * `PUBLIC_ID_LENGTH` alphabet-membership check — the separator itself
 * occupies a position that check requires to be alphanumeric.
 */
const SUPPORTED_PUBLIC_ID_LENGTHS: readonly number[] = [PUBLIC_ID_LENGTH, LEGACY_PUBLIC_ID_LENGTH];

export function generatePublicId(): string {
  return generateOpaqueId(PUBLIC_ID_LENGTH);
}

/** Accepts exactly the current (16-char) or legacy (8-char) length — never a range, never prefix matching. */
export function isValidPublicId(value: string): boolean {
  return SUPPORTED_PUBLIC_ID_LENGTHS.some((length) => isOpaqueId(value, length));
}

/**
 * Splits a `/{locale}/catalog/{slug}` path segment into a product's
 * `{publicId}-{slug}` shape (ADR-0010) — used to disambiguate a category
 * route (plain slug) from a product route (publicId-prefixed) before
 * resolution. Shared by apps/web's catalog page and proxy.ts (ADR-0018) so
 * the two never drift. Tries the current 16-character format before the
 * legacy 8-character one (see SUPPORTED_PUBLIC_ID_LENGTHS's doc comment for
 * why this order is provably unambiguous, not a heuristic).
 */
export function splitCatalogSlug(slug: string): { publicId: string; rest: string } | undefined {
  for (const length of SUPPORTED_PUBLIC_ID_LENGTHS) {
    if (slug.length > length && slug[length] === '-') {
      const candidate = slug.slice(0, length);
      if (isOpaqueId(candidate, length)) {
        return { publicId: candidate, rest: slug.slice(length + 1) };
      }
    }
  }
  return undefined;
}
