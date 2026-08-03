import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@eramix/domain';

/**
 * Regression guard for the exact class of bug found during the
 * acceptance-readiness audit: consent-banner.tsx/manage-consent-link.tsx
 * shipped hardcoded English strings with no corresponding message keys in
 * ru.json/uz.json at all — a silent localization gap `next-intl` itself does
 * not catch at build time (a missing key falls back to rendering the raw key
 * path, not a build/type error). Every locale file must expose exactly the
 * same set of message keys, in every namespace, so a key added for one
 * locale can never be silently absent for another (CLAUDE.md: "an absent
 * translation is not substituted with a different locale" — the same
 * principle applied to UI chrome, not only entity content).
 */

function loadMessages(locale: string): Record<string, unknown> {
  const filePath = path.resolve(import.meta.dirname, '..', '..', 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('locale message parity', () => {
  const messagesByLocale = new Map(
    SUPPORTED_LOCALES.map((locale) => [locale, loadMessages(locale)] as const),
  );

  it('every supported locale has a messages file with at least one namespace', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(messagesByLocale.get(locale)!).length).toBeGreaterThan(0);
    }
  });

  it('every locale exposes exactly the same set of message keys as the default locale', () => {
    const [referenceLocale, ...otherLocales] = SUPPORTED_LOCALES;
    const referenceKeys = flattenKeys(messagesByLocale.get(referenceLocale!)!).sort();

    for (const locale of otherLocales) {
      const keys = flattenKeys(messagesByLocale.get(locale)!).sort();
      expect(keys, `${locale}.json key set must match ${referenceLocale}.json`).toEqual(
        referenceKeys,
      );
    }
  });

  it('no message value is an empty string', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = messagesByLocale.get(locale)!;
      for (const key of flattenKeys(messages)) {
        const value = key.split('.').reduce<unknown>((node, segment) => {
          return (node as Record<string, unknown>)[segment];
        }, messages);
        expect(value, `${locale}.json:${key} must not be an empty string`).not.toBe('');
      }
    }
  });
});
