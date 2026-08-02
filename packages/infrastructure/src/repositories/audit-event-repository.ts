import {
  clampPagination,
  type AuditEventListFilter,
  type AuditEventRepository,
  type Page,
} from '@eramix/application';
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

  async listByEntity(
    entityType: string,
    entityId: string,
    input: { limit?: number; offset?: number } & AuditEventListFilter = {},
  ): Promise<Page<AuditEvent>> {
    const { limit, offset } = clampPagination(input);
    const where: Record<string, unknown> = { entityType, entityId };
    if (input.action !== undefined) {
      where['action'] = input.action;
    }
    if (input.actorUserId !== undefined) {
      where['actorUserId'] = input.actorUserId;
    }
    if (input.createdFrom !== undefined || input.createdTo !== undefined) {
      where['createdAt'] = {
        ...(input.createdFrom !== undefined ? { gte: input.createdFrom } : {}),
        ...(input.createdTo !== undefined ? { lte: input.createdTo } : {}),
      };
    }
    const orderBy = {
      createdAt: input.sort === 'createdAt_asc' ? ('asc' as const) : ('desc' as const),
    };
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.auditEvent.findMany({ where, orderBy, take: limit, skip: offset }),
      client.auditEvent.count({ where }),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
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
