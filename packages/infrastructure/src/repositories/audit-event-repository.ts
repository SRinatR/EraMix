import type { AuditEventRepository } from '@eramix/application';
import type { AuditEvent } from '@eramix/domain';
import type { AuditEvent as AuditEventRow } from '../generated/prisma/client.js';
import { nullableJsonToRecord, nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaAuditEventRepository implements AuditEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<AuditEvent> {
    const row = await resolveClient(this.prisma).auditEvent.create({
      data: {
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        ...(event.metadata !== undefined ? { metadata: event.metadata as object } : {}),
        traceId: event.traceId ?? null,
      },
    });
    return toDomain(row);
  }

  async listByEntity(entityType: string, entityId: string): Promise<readonly AuditEvent[]> {
    const rows = await resolveClient(this.prisma).auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }
}

function toDomain(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    actorUserId: nullToUndefined(row.actorUserId),
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: nullableJsonToRecord(row.metadata),
    traceId: nullToUndefined(row.traceId),
    createdAt: row.createdAt,
  };
}
