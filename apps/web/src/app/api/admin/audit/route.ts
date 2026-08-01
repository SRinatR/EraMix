import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { hasPermission, requirePermission } from '@eramix/application';
import { ValidationFailedError } from '@eramix/domain';
import { NextResponse } from 'next/server';

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

  const container = getContainer();
  const events = await container.auditEvents.listByEntity(entityType, entityId);

  return NextResponse.json({
    items: events.map((event) => ({
      id: event.id,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    })),
  });
});
