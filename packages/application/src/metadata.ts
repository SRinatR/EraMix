import { DEFAULT_LOCALE, ValidationFailedError, type LocaleCode } from '@eramix/domain';

export interface AlternateLinks {
  readonly canonical: string;
  readonly languages: Readonly<Record<string, string>>;
  readonly xDefault: string;
}

/**
 * CLAUDE.md: "Every published translation must provide self-canonical,
 * hreflang links for available translations, and x-default." `availableUrls`
 * must contain only *published* translations with a resolved canonical URL —
 * callers build it from repository data (route-resolution/sitemap already
 * filter for PUBLISHED + isCanonical); this function is pure URL-shaping so
 * it can be unit-tested without a repository. x-default points at the
 * default-locale (`en`) URL when published, otherwise falls back to the
 * requested locale's own canonical URL (never a wrong-locale page rendered
 * as x-default).
 */
export function buildAlternateLinks(
  currentLocale: LocaleCode,
  availableUrls: ReadonlyMap<LocaleCode, string>,
): AlternateLinks {
  const canonical = availableUrls.get(currentLocale);
  if (!canonical) {
    throw new ValidationFailedError(`No published URL available for locale "${currentLocale}".`, {
      currentLocale,
      availableLocales: [...availableUrls.keys()],
    });
  }

  const languages: Record<string, string> = {};
  for (const [locale, url] of availableUrls) {
    languages[locale] = url;
  }

  return {
    canonical,
    languages,
    xDefault: availableUrls.get(DEFAULT_LOCALE) ?? canonical,
  };
}
