import { describe, expect, it } from 'vitest';
import { LocaleNotSupportedError } from './errors.js';
import { isSupportedLocale, parseLocale } from './locale.js';

describe('locale allowlist', () => {
  it.each(['ru', 'tt', 'en', 'uz'])('accepts %s as a supported locale', (locale) => {
    expect(isSupportedLocale(locale)).toBe(true);
    expect(parseLocale(locale)).toBe(locale);
  });

  it('rejects a locale outside the allowlist', () => {
    expect(isSupportedLocale('fr')).toBe(false);
  });

  it('throws a typed LocaleNotSupportedError for an unsupported locale', () => {
    expect(() => parseLocale('fr')).toThrow(LocaleNotSupportedError);
    try {
      parseLocale('fr');
    } catch (error) {
      expect(error).toBeInstanceOf(LocaleNotSupportedError);
      expect((error as LocaleNotSupportedError).code).toBe('LOCALE_NOT_SUPPORTED');
    }
  });
});
