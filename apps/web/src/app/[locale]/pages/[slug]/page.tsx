import { AnalyticsEventTracker } from '@/components/analytics-event-tracker';
import { ContentBody } from '@/components/content-body';
import { JsonLd } from '@/components/json-ld';
import { getContainer } from '@/server/container';
import { contentAlternates } from '@/server/seo';
import { buildWebPageJsonLd, resolveContentRoute } from '@eramix/application';
import { isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
export const dynamic = 'force-dynamic';

interface PageParams {
  locale: string;
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    return {};
  }
  const container = getContainer();
  const resolution = await resolveContentRoute(container.content, 'PAGES', locale, slug);
  if (resolution.kind !== 'canonical') {
    return {};
  }
  return contentAlternates(locale as LocaleCode, resolution.content);
}

export default async function CmsPage({ params }: { params: Promise<PageParams> }) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const container = getContainer();
  const resolution = await resolveContentRoute(container.content, 'PAGES', locale, slug);
  if (resolution.kind === 'not-found' || resolution.kind === 'retired') {
    // A real HTTP 410 for the 'retired' case is served by src/proxy.ts before
    // this page ever renders (page.tsx/Server Components cannot set a
    // custom status code — see ADR-0018). This is defense-in-depth only.
    notFound();
  }
  if (resolution.kind === 'redirect') {
    permanentRedirect(resolution.canonicalUrl);
  }

  const { translation } = resolution;
  return (
    <main>
      <AnalyticsEventTracker
        locale={locale}
        fields={{
          eventName: 'page_view',
          pageType: 'page',
          canonicalPath: `/${locale}/pages/${slug}`,
        }}
      />
      <JsonLd data={{ ...buildWebPageJsonLd(translation) }} />
      <h1>{translation.title}</h1>
      {translation.summary && <p>{translation.summary}</p>}
      <ContentBody content={translation.content} />
    </main>
  );
}
