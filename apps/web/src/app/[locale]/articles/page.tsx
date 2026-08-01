import { getContainer } from '@/server/container';
import { Link } from '@/i18n/navigation';
import { listContentByType } from '@eramix/application';
import { isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Articles' };

export default async function ArticleIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const container = getContainer();
  const articles = await listContentByType(container.content, 'ARTICLE');

  return (
    <main>
      <h1>Articles</h1>
      {articles.length === 0 ? (
        <p>No articles are published yet.</p>
      ) : (
        <ul>
          {articles.map((article) => {
            const translation = article.translations.find(
              (t) => t.locale === (locale as LocaleCode),
            );
            const canonicalRoute = translation?.routes.find((r) => r.isCanonical);
            if (!translation || !canonicalRoute) {
              return null;
            }
            return (
              <li key={article.id}>
                <Link href={`/articles/${canonicalRoute.slug}`}>{translation.title}</Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
