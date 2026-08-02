import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  type AuditEventListFilter,
  type AuditEventRepository,
  type CursorPage,
  type CursorPaginationInput,
} from '@eramix/application';
import type { AuditEvent } from '@eramix/domain';
import type { AuditEvent as AuditEventRow } from '../generated/prisma/client.js';
import { nullableJsonToRecord, nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import {
  buildCursorOrderBy,
  combineWithCursor,
  cursorValueOf,
  type SortSpec,
} from './cursor-query.js';
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
    input: CursorPaginationInput & AuditEventListFilter = {},
  ): Promise<CursorPage<AuditEvent>> {
    const limit = clampLimit(input.limit);
    const sortSpec = resolveAuditEventSort(input.sort);
    const decoded = decodeCursor(input.cursor);
    const filterWhere: Record<string, unknown> = { entityType, entityId };
    if (input.action !== undefined) {
      filterWhere['action'] = input.action;
    }
    if (input.actorUserId !== undefined) {
      filterWhere['actorUserId'] = input.actorUserId;
    }
    if (input.createdFrom !== undefined || input.createdTo !== undefined) {
      filterWhere['createdAt'] = {
        ...(input.createdFrom !== undefined ? { gte: input.createdFrom } : {}),
        ...(input.createdTo !== undefined ? { lte: input.createdTo } : {}),
      };
    }
    const where = combineWithCursor(filterWhere, sortSpec, decoded);
    const orderBy = buildCursorOrderBy(sortSpec);
    const client = resolveClient(this.prisma);
    const rows = await client.auditEvent.findMany({ where, orderBy, take: limit + 1 });
    const items = rows.map(toDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: cursorValueOf(sortSpec, item as unknown as Record<string, unknown>),
      id: item.id,
    }));
  }
}

/** DB-005: explicit allowlist, never a raw sort field passed straight into Prisma's `orderBy`. */
function resolveAuditEventSort(sort: AuditEventListFilter['sort']): SortSpec {
  switch (sort) {
    case 'createdAt_asc':
      return { field: 'createdAt', direction: 'asc', kind: 'date' };
    case 'createdAt_desc':
    default:
      return { field: 'createdAt', direction: 'desc', kind: 'date' };
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
