import { ValidationFailedError } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { buildAlternateLinks } from './metadata.js';

describe('buildAlternateLinks', () => {
  it('builds canonical + hreflang languages + x-default from the default locale (en)', () => {
    const urls = new Map<'en' | 'ru' | 'uz', string>([
      ['en', '/en/articles/spring-festival'],
      ['ru', '/ru/articles/vesennii-festival'],
    ]);

    const result = buildAlternateLinks('ru', urls);

    expect(result.canonical).toBe('/ru/articles/vesennii-festival');
    expect(result.languages).toEqual({
      en: '/en/articles/spring-festival',
      ru: '/ru/articles/vesennii-festival',
    });
    expect(result.xDefault).toBe('/en/articles/spring-festival');
  });

  it('falls back x-default to the requested locale when the default locale has no published translation', () => {
    const urls = new Map<'en' | 'ru' | 'uz', string>([['ru', '/ru/articles/vesennii-festival']]);

    const result = buildAlternateLinks('ru', urls);

    expect(result.xDefault).toBe('/ru/articles/vesennii-festival');
  });

  it('throws ValidationFailedError when the requested locale has no published URL (missing translation, not a wrong-locale fallback — CLAUDE.md)', () => {
    const urls = new Map<'en' | 'ru' | 'uz', string>([['en', '/en/articles/spring-festival']]);

    expect(() => buildAlternateLinks('uz', urls)).toThrow(ValidationFailedError);
  });
});
