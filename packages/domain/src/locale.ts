import { LocaleNotSupportedError } from './errors.js';

export const SUPPORTED_LOCALES = ['en', 'ru', 'uz'] as const;

export const DEFAULT_LOCALE: LocaleCode = 'en';

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is LocaleCode {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: string): LocaleCode {
  if (!isSupportedLocale(value)) {
    throw new LocaleNotSupportedError(`Locale "${value}" is not in the supported allowlist.`, {
      value,
      supported: SUPPORTED_LOCALES,
    });
  }
  return value;
}
