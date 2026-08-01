import { ValidationFailedError } from './errors.js';

/**
 * Technical route segments (CLAUDE.md's canonical URL table) and platform
 * system routes (TZ Appendix F.2) that a content/category/product slug must
 * never collide with.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'account',
  'login',
  'logout',
  'articles',
  'pages',
  'catalog',
  'orders',
  'sitemap.xml',
  'robots.txt',
  '_next',
]);

// Deny-by-default: only lowercase ASCII letters/digits, single hyphens
// between segments. This single allowlist pattern is what actually rejects
// every category CLAUDE.md names — empty input, control characters, path
// separators (/, \), query/fragment characters (?, #), dot segments (.,
// ..), and encoded separators (%2F etc., since a literal "%" is itself
// outside the allowlist) — rather than chasing each one with its own
// denylist rule, which is easy to leave a gap in.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalizes and validates a slug for Content/Category/Product routes.
 * Slug changes are explicit commands (CLAUDE.md) — this only cleans and
 * validates an already-decided value; it does not transliterate or
 * auto-generate a slug from a title.
 */
export function normalizeSlug(
  rawInput: string,
  reservedSlugs: ReadonlySet<string> = RESERVED_SLUGS,
): string {
  const normalized = rawInput.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new ValidationFailedError('Slug must not be empty.', { rawInput });
  }

  if (!SLUG_PATTERN.test(normalized)) {
    throw new ValidationFailedError(
      'Slug must contain only lowercase letters, digits, and single hyphens between segments (no spaces, path separators, query/fragment characters, dot segments, or percent-encoding).',
      { rawInput, normalized },
    );
  }

  if (reservedSlugs.has(normalized)) {
    throw new ValidationFailedError(`Slug "${normalized}" is reserved and cannot be used.`, {
      normalized,
    });
  }

  return normalized;
}
