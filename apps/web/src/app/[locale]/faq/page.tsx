import { ContentBody } from '@/components/content-body';
import { getContainer } from '@/server/container';
import { listContentByType } from '@eramix/application';
import { isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'FAQ' };

/**
 * FAQ items have no per-item route (ContentRouteNamespace only covers
 * ARTICLES/PAGES — TZ Appendix F.3 groups FAQ as a single listing page, not
 * individually addressable canonical URLs), so this page lists every
 * PUBLISHED FAQ_ITEM translation directly rather than resolving routes.
 */
export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const container = getContainer();
  const items = await listContentByType(container.content, 'FAQ_ITEM');

  return (
    <main>
      <h1>FAQ</h1>
      {items.length === 0 ? (
        <p>No FAQ entries are published yet.</p>
      ) : (
        <dl>
          {items.map((item) => {
            const translation = item.translations.find((t) => t.locale === (locale as LocaleCode));
            if (!translation) {
              return null;
            }
            return (
              <div key={item.id}>
                <dt>{translation.title}</dt>
                <dd>
                  {translation.summary && <p>{translation.summary}</p>}
                  <ContentBody content={translation.content} />
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </main>
  );
}
