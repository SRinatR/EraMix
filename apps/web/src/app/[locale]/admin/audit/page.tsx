import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import {
  parseAllowlistedParam,
  parsePaginationParams,
  parseStringParam,
} from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { hasPermission, type AuditEventListFilter } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const SORTS: readonly NonNullable<AuditEventListFilter['sort']>[] = [
  'createdAt_asc',
  'createdAt_desc',
];

/**
 * Search-by-entity only (AuditEventRepository.listByEntity has no
 * list-everything method — TZ audit search is entity-scoped, e.g. "show me
 * everything that happened to this order/category/content item"). A plain
 * GET form needs no client-side JavaScript.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  if (
    !hasPermission(actor.platformRole, 'audit.read.full') &&
    !hasPermission(actor.platformRole, 'audit.read.limited')
  ) {
    notFound();
  }

  const resolved = await searchParams;
  const entityType = parseStringParam(resolved, 'entityType');
  const entityId = parseStringParam(resolved, 'entityId');
  const action = parseStringParam(resolved, 'action');
  const actorUserId = parseStringParam(resolved, 'actorUserId');
  const sort = parseAllowlistedParam(resolved, 'sort', SORTS);
  const container = getContainer();
  const pagination = parsePaginationParams(resolved);
  const result =
    entityType !== undefined && entityId !== undefined
      ? await container.auditEvents.listByEntity(entityType, entityId, {
          ...pagination,
          ...(action !== undefined ? { action } : {}),
          ...(actorUserId !== undefined ? { actorUserId } : {}),
          ...(sort !== undefined ? { sort } : {}),
        })
      : undefined;

  return (
    <main>
      <h1>Audit search</h1>
      <form method="get">
        <label>
          Entity type
          <input name="entityType" defaultValue={entityType} placeholder="Category" required />
        </label>
        <label>
          Entity ID
          <input name="entityId" defaultValue={entityId} required />
        </label>
        <label>
          Action
          <input name="action" defaultValue={action ?? ''} placeholder="category.created" />
        </label>
        <label>
          Actor user ID
          <input name="actorUserId" defaultValue={actorUserId ?? ''} />
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
        <button type="submit">Search</button>
      </form>

      {result &&
        (result.data.length === 0 ? (
          <p>No audit events match this filter.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((event) => (
                  <tr key={event.id}>
                    <td>{event.createdAt.toISOString()}</td>
                    <td>{event.actorUserId ?? '(system)'}</td>
                    <td>{event.action}</td>
                    <td>
                      <pre>{JSON.stringify(event.metadata ?? {}, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              basePath="/admin/audit"
              page={result.page}
              currentCursor={pagination.cursor}
              extraParams={{
                ...(entityType !== undefined ? { entityType } : {}),
                ...(entityId !== undefined ? { entityId } : {}),
                ...(action !== undefined ? { action } : {}),
                ...(actorUserId !== undefined ? { actorUserId } : {}),
                ...(sort !== undefined ? { sort } : {}),
              }}
            />
          </>
        ))}
    </main>
  );
}
