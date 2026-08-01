import { isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '../../i18n/routing';

// A plain process.env read (not the validated container/env.ts): this only
// needs a metadata-formatting default and must stay usable at build time for
// the SSG home page, which does not otherwise require DATABASE_URL.
export const metadata: Metadata = {
  title: 'EraMix',
  metadataBase: new URL(process.env['PUBLIC_ORIGIN'] ?? 'https://eramix.example'),
};

export function generateStaticParams(): { locale: LocaleCode }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  // Enables static rendering for this locale (next-intl requirement) —
  // must run before any hook that reads the request locale.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
