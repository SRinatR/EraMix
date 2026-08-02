import { ContentBody } from '@/components/content-body';
import { getContainer } from '@/server/container';
import { contentAlternates } from '@/server/seo';
import { resolveContentRoute } from '@eramix/application';
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
  const resolution = await resolveContentRoute(container.content, 'ARTICLES', locale, slug);
  if (resolution.kind !== 'canonical') {
    return {};
  }
  return contentAlternates(locale as LocaleCode, resolution.content);
}

export default async function ArticlePage({ params }: { params: Promise<PageParams> }) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const container = getContainer();
  const resolution = await resolveContentRoute(container.content, 'ARTICLES', locale, slug);
  if (resolution.kind === 'not-found') {
    notFound();
  }
  if (resolution.kind === 'redirect') {
    permanentRedirect(resolution.canonicalUrl);
  }

  const { translation } = resolution;
  return (
    <main>
      <h1>{translation.title}</h1>
      {translation.summary && <p>{translation.summary}</p>}
      <ContentBody content={translation.content} />
    </main>
  );
}
