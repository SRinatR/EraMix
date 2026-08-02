import { JsonLd } from '@/components/json-ld';
import { getContainer } from '@/server/container';
import { staticPageAlternates } from '@/server/seo';
import {
  buildCanonicalOrigin,
  buildOrganizationJsonLd,
  getPlatformSettings,
} from '@eramix/application';
import { isSupportedLocale } from '@eramix/domain';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// Was previously statically prerendered (SSG); now reads PlatformSettings
// from a live database to render real, admin-controlled Organization facts
// instead of a hardcoded name (CLAUDE.md: "only when real and maintained")
// — force-dynamic keeps `next build` from needing a live database, matching
// every other DB-backed public page in this app (catalog, articles, ...).
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    return {};
  }
  return staticPageAlternates(locale, '', {
    title: 'EraMix',
    description: 'B2B catalog, quote requests, and order tracking.',
  });
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

  // CLAUDE.md: Organization JSON-LD is published "only when real and
  // maintained" — buildOrganizationJsonLd returns undefined until an admin
  // sets a real organization name in /admin/settings; never fabricated here.
  const container = getContainer();
  const settings = await getPlatformSettings({ settingsRepo: container.settingsRepo });
  const organizationJsonLd = buildOrganizationJsonLd(settings);

  return (
    <>
      {organizationJsonLd && (
        <JsonLd
          data={{
            ...organizationJsonLd,
            // schema.org "url" must be absolute; a relative path is not
            // auto-resolved here the way Next's typed Metadata fields are.
            url: new URL(`/${locale}`, buildCanonicalOrigin(settings)).toString(),
          }}
        />
      )}
      <HomePageContent />
    </>
  );
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
