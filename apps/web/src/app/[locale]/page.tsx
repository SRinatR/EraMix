import { SUPPORTED_LOCALES, isSupportedLocale } from '@eramix/domain';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export function generateMetadata(): Metadata {
  const languages: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = `/${locale}`;
  }
  return { alternates: { canonical: '/', languages: { ...languages, 'x-default': '/en' } } };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  // Must run before any hook reads the request locale; useTranslations
  // itself can't be called from this async component body (next-intl
  // requires hooks in a synchronous component), hence the split below.
  setRequestLocale(locale);

  return <HomePageContent />;
}

function HomePageContent() {
  const t = useTranslations('HomePage');
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </main>
  );
}
