import { Link } from '@/i18n/navigation';
import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { AddContentTranslationForm } from './add-content-translation-form';
import { ChangeSlugForm } from '../catalog/change-slug-form';
import { TransitionStatusForm } from '../catalog/transition-status-form';
import { requirePermission } from '@eramix/application';
import type { ContentRouteNamespace, ContentType } from '@eramix/domain';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const NAMESPACE_BY_TYPE: Partial<Record<ContentType, ContentRouteNamespace>> = {
  ARTICLE: 'ARTICLES',
  PAGE: 'PAGES',
};

function firstTranslationTitle(translations: readonly { locale: string; title: string }[]): string {
  return (
    translations.find((translation) => translation.locale === 'en')?.title ??
    translations[0]?.title ??
    '(no translation)'
  );
}

export default async function AdminContentPage() {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'content.write');
  } catch {
    notFound();
  }

  const container = getContainer();
  const items = await container.content.listAll();

  return (
    <main>
      <h1>
        Content <Link href="/admin/content/new">New content item</Link>
      </h1>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Title</th>
            <th>Status</th>
            <th>Change status</th>
            <th>Add translation</th>
            <th>Slugs</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const namespace = NAMESPACE_BY_TYPE[item.type];
            return (
              <tr key={item.id}>
                <td>{item.type}</td>
                <td>{firstTranslationTitle(item.translations)}</td>
                <td>{item.status}</td>
                <td>
                  <TransitionStatusForm
                    endpoint={`/api/admin/content/${item.id}/status`}
                    currentStatus={item.status}
                    expectedVersion={item.version}
                  />
                </td>
                <td>
                  <AddContentTranslationForm
                    contentId={item.id}
                    existingLocales={item.translations.map((t) => t.locale)}
                    allowSlug={namespace !== undefined}
                  />
                </td>
                <td>
                  {namespace &&
                    item.translations.map((translation) => (
                      <div key={translation.id}>
                        {translation.locale}:{' '}
                        <ChangeSlugForm
                          endpoint={`/api/admin/content/${item.id}/translations/${translation.id}/slug`}
                          currentSlug={translation.routes.find((route) => route.isCanonical)?.slug}
                          extraBody={{ locale: translation.locale, namespace }}
                        />
                      </div>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
