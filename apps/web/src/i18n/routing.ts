import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@eramix/domain';
import { defineRouting } from 'next-intl/routing';

// CLAUDE.md: locale is the first segment of every indexable public URL
// (localePrefix: 'always'); an unprefixed entry URL is redirected per
// Accept-Language (localeDetection: true), while an explicit prefix always
// wins. Locales/default come from packages/domain (ADR-0010) — the single
// source of truth other layers validate against.
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: true,
});
