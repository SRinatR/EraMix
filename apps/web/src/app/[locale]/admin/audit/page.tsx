import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { hasPermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Search-by-entity only (AuditEventRepository.listByEntity has no
 * list-everything method — TZ audit search is entity-scoped, e.g. "show me
 * everything that happened to this order/category/content item"). A plain
 * GET form needs no client-side JavaScript.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
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

  const { entityType, entityId } = await searchParams;
  const container = getContainer();
  const events =
    entityType && entityId
      ? await container.auditEvents.listByEntity(entityType, entityId)
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
        <button type="submit">Search</button>
      </form>

      {events && (
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
            {events.length === 0 ? (
              <tr>
                <td colSpan={4}>No audit events found for this entity.</td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <td>{event.createdAt.toISOString()}</td>
                  <td>{event.actorUserId ?? '(system)'}</td>
                  <td>{event.action}</td>
                  <td>
                    <pre>{JSON.stringify(event.metadata ?? {}, null, 2)}</pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
