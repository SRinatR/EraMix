import { ContentBody, toParagraphs } from '@/components/content-body';
import { JsonLd } from '@/components/json-ld';
import { getContainer } from '@/server/container';
import { staticPageAlternates } from '@/server/seo';
import { listContentByType } from '@eramix/application';
import { isSupportedLocale, type LocaleCode } from '@eramix/domain';
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
  return staticPageAlternates(locale, '/faq', {
    title: 'FAQ',
    description: 'Frequently asked questions.',
  });
}

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
  const localizedItems = items
    .map((item) => item.translations.find((t) => t.locale === (locale as LocaleCode)))
    .filter(
      (translation): translation is NonNullable<typeof translation> => translation !== undefined,
    );

  return (
    <main>
      {localizedItems.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: localizedItems.map((translation) => ({
              '@type': 'Question',
              name: translation.title,
              acceptedAnswer: {
                '@type': 'Answer',
                text: toParagraphs(translation.content).join('\n\n'),
              },
            })),
          }}
        />
      )}
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
