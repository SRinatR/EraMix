'use client';

import { usePathname, useRouter } from '@/i18n/navigation';
import { SUPPORTED_LOCALES, type LocaleCode } from '@eramix/domain';
import { useParams } from 'next/navigation';
import { useTransition } from 'react';
import { sendAnalyticsEvent } from './analytics-client';

const LOCALE_LABELS: Record<LocaleCode, string> = {
  en: 'English',
  ru: 'Русский',
  uz: "O'zbek",
};

/**
 * Swaps only the locale segment, preserving the current path and search
 * params (CLAUDE.md: "an explicit locale prefix always wins") — never a
 * navigation to "/", which would silently discard where the visitor was.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const currentLocale = params['locale'] as LocaleCode;
  const [isPending, startTransition] = useTransition();

  function handleChange(nextLocale: LocaleCode): void {
    sendAnalyticsEvent(currentLocale, {
      eventName: 'locale_changed',
      pageType: 'other',
      canonicalPath: pathname,
      fromLocale: currentLocale,
      toLocale: nextLocale,
    });
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <nav aria-label="Language">
      <ul>
        {SUPPORTED_LOCALES.map((locale) => (
          <li key={locale}>
            {locale === currentLocale ? (
              <span aria-current="true">{LOCALE_LABELS[locale]}</span>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleChange(locale)}
                lang={locale}
              >
                {LOCALE_LABELS[locale]}
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
