import { Link } from '@/i18n/navigation';
import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import {
  parseAllowlistedParam,
  parsePaginationParams,
  parseStringParam,
} from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { AddContentTranslationForm } from './add-content-translation-form';
import { EditContentTranslationForm } from './edit-content-translation-form';
import { ChangeSlugForm } from '../catalog/change-slug-form';
import { RetireForm } from '../catalog/retire-form';
import { TransitionStatusForm } from '../catalog/transition-status-form';
import { requirePermission } from '@eramix/application';
import type { ContentRouteNamespace, ContentType, PublicationStatus } from '@eramix/domain';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const NAMESPACE_BY_TYPE: Partial<Record<ContentType, ContentRouteNamespace>> = {
  ARTICLE: 'ARTICLES',
  PAGE: 'PAGES',
};
const CONTENT_TYPES: readonly ContentType[] = ['ARTICLE', 'PAGE', 'FAQ_ITEM'];
const STATUSES: readonly PublicationStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const SORTS = ['createdAt_asc', 'createdAt_desc'] as const;

function firstTranslationTitle(translations: readonly { locale: string; title: string }[]): string {
  return (
    translations.find((translation) => translation.locale === 'en')?.title ??
    translations[0]?.title ??
    '(no translation)'
  );
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const resolved = await searchParams;
  const search = parseStringParam(resolved, 'search');
  const type = parseAllowlistedParam(resolved, 'type', CONTENT_TYPES);
  const status = parseAllowlistedParam(resolved, 'status', STATUSES);
  const sort = parseAllowlistedParam(resolved, 'sort', SORTS);
  const pagination = parsePaginationParams(resolved);
  const { data: items, page } = await container.content.listAll({
    ...pagination,
    ...(search !== undefined ? { search } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(sort !== undefined ? { sort } : {}),
  });

  return (
    <main>
      <h1>
        Content <Link href="/admin/content/new">New content item</Link>
      </h1>
      <form method="get">
        <label>
          Search
          <input type="search" name="search" defaultValue={search ?? ''} />
        </label>
        <label>
          Type
          <select name="type" defaultValue={type ?? ''}>
            <option value="">All</option>
            {CONTENT_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={sort ?? 'createdAt_desc'}>
            {SORTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      {items.length === 0 ? (
        <p>No content items match this filter.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Title</th>
              <th>Status</th>
              <th>Change status</th>
              <th>Retire</th>
              <th>Add translation</th>
              <th>Edit translations</th>
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
                    {item.retiredAt !== undefined ? (
                      <span>Retired: {item.retirementReason}</span>
                    ) : item.status === 'ARCHIVED' ? (
                      <RetireForm
                        endpoint={`/api/admin/content/${item.id}/retire`}
                        expectedVersion={item.version}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <AddContentTranslationForm
                      contentId={item.id}
                      existingLocales={item.translations.map((t) => t.locale)}
                      allowSlug={namespace !== undefined}
                    />
                  </td>
                  <td>
                    {item.translations.map((translation) => (
                      <div key={translation.id}>
                        {translation.locale}:{' '}
                        <EditContentTranslationForm
                          endpoint={`/api/admin/content/${item.id}/translations/${translation.id}`}
                          expectedVersion={translation.version}
                          initialTitle={translation.title}
                          initialSummary={translation.summary}
                          initialContent={translation.content}
                          initialSeoTitle={translation.seoTitle}
                          initialSeoDescription={translation.seoDescription}
                        />
                      </div>
                    ))}
                  </td>
                  <td>
                    {namespace &&
                      item.translations.map((translation) => (
                        <div key={translation.id}>
                          {translation.locale}:{' '}
                          <ChangeSlugForm
                            endpoint={`/api/admin/content/${item.id}/translations/${translation.id}/slug`}
                            currentSlug={
                              translation.routes.find((route) => route.isCanonical)?.slug
                            }
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
      )}
      <PaginationControls
        basePath="/admin/content"
        page={page}
        currentCursor={pagination.cursor}
        extraParams={{
          ...(search !== undefined ? { search } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(sort !== undefined ? { sort } : {}),
        }}
      />
    </main>
  );
}
