import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { hasPermission, requirePermission, type AuditEventListFilter } from '@eramix/application';
import { ValidationFailedError } from '@eramix/domain';
import { NextResponse } from 'next/server';

type AuditSort = NonNullable<AuditEventListFilter['sort']>;
const SORTS: readonly AuditSort[] = ['createdAt_asc', 'createdAt_desc'];

/** DB-005: only an exact allowlist member is ever forwarded to the repository's `orderBy`. */
function parseSort(value: string | null): AuditSort | undefined {
  return value !== null && (SORTS as readonly string[]).includes(value)
    ? (value as AuditSort)
    : undefined;
}

/**
 * TZ §3.1 table 7: MANAGER holds `audit.read.limited`, ADMIN/AUDITOR hold
 * `audit.read.full` — both are sufficient to search here; the MVP audit
 * trail carries no field-level redaction between the two scopes yet (no
 * PII/secrets are ever written into `AuditEvent.metadata` in the first
 * place, per CLAUDE.md's observability policy), so both scopes see the
 * same rows for now.
 */
export const GET = withApiHandler('admin.audit.search', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  if (!hasPermission(actor.platformRole, 'audit.read.full')) {
    requirePermission(actor.platformRole, 'audit.read.limited');
  }

  const url = new URL(request.url);
  const entityType = url.searchParams.get('entityType');
  const entityId = url.searchParams.get('entityId');
  if (!entityType || !entityId) {
    throw new ValidationFailedError(
      'Query parameters "entityType" and "entityId" are both required.',
      { entityType, entityId },
    );
  }

  const action = url.searchParams.get('action');
  const actorUserId = url.searchParams.get('actorUserId');
  const createdFromParam = url.searchParams.get('createdFrom');
  const createdToParam = url.searchParams.get('createdTo');
  const sort = parseSort(url.searchParams.get('sort'));
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  const container = getContainer();
  const { items, total, limit, offset } = await container.auditEvents.listByEntity(
    entityType,
    entityId,
    {
      ...(action !== null ? { action } : {}),
      ...(actorUserId !== null ? { actorUserId } : {}),
      ...(createdFromParam !== null ? { createdFrom: new Date(createdFromParam) } : {}),
      ...(createdToParam !== null ? { createdTo: new Date(createdToParam) } : {}),
      ...(sort !== undefined ? { sort } : {}),
      ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
      ...(offsetParam !== null ? { offset: Number(offsetParam) } : {}),
    },
  );

  return NextResponse.json({
    items: items.map((event) => ({
      id: event.id,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    })),
    total,
    limit,
    offset,
  });
});
