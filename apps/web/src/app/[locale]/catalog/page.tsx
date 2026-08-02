import { getContainer } from '@/server/container';
import { staticPageAlternates } from '@/server/seo';
import { listCatalogCategories } from '@eramix/application';
import { isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { Link } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
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
  return staticPageAlternates(locale, '/catalog', {
    title: 'Catalog',
    description: 'Browse the published product catalog.',
  });
}

export default async function CatalogIndexPage({
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
  const categories = await listCatalogCategories(container.categories, undefined);

  return (
    <main>
      <h1>Catalog</h1>
      {categories.length === 0 ? (
        <p>No categories are published yet.</p>
      ) : (
        <ul>
          {categories.map((category) => {
            const translation = category.translations.find(
              (t) => t.locale === (locale as LocaleCode),
            );
            const canonicalRoute = translation?.routes.find((r) => r.isCanonical);
            if (!translation || !canonicalRoute) {
              return null;
            }
            return (
              <li key={category.id}>
                <Link href={`/catalog/${canonicalRoute.slug}`}>{translation.name}</Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
