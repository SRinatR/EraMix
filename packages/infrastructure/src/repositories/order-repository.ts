import {
  clampPagination,
  type OrderListFilter,
  type OrderRepository,
  type Page,
  type OrderWithLines,
} from '@eramix/application';
import {
  IdempotencyConflictError,
  ResourceNotFoundError,
  type Order,
  type OrderLine,
  type OrderStatus,
  type OrderStatusHistoryEntry,
} from '@eramix/domain';
import type {
  Order as OrderRow,
  OrderLine as OrderLineRow,
  OrderStatusHistory as OrderStatusHistoryRow,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import {
  assertOptimisticLockAcquired,
  withUniqueConstraintMapping,
} from '../prisma-error-mapping.js';
import { nullableJsonToRecord, nullToUndefined } from '../prisma-json.js';
import { resolveClient } from '../transaction-context.js';

const WITH_LINES_AND_HISTORY = { lines: true, statusHistory: true } as const;
type OrderRowWithLines = OrderRow & {
  lines: OrderLineRow[];
  statusHistory: OrderStatusHistoryRow[];
};

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<OrderWithLines | undefined> {
    const row = await resolveClient(this.prisma).order.findUnique({
      where: { id },
      include: WITH_LINES_AND_HISTORY,
    });
    return row ? toDomain(row) : undefined;
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderWithLines | undefined> {
    const row = await resolveClient(this.prisma).order.findUnique({
      where: { orderNumber },
      include: WITH_LINES_AND_HISTORY,
    });
    return row ? toDomain(row) : undefined;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<OrderWithLines | undefined> {
    const row = await resolveClient(this.prisma).order.findUnique({
      where: { idempotencyKey },
      include: WITH_LINES_AND_HISTORY,
    });
    return row ? toDomain(row) : undefined;
  }

  async create(
    order: Omit<Order, 'version' | 'createdAt' | 'updatedAt'>,
    lines: readonly Omit<OrderLine, 'id'>[],
  ): Promise<OrderWithLines> {
    const row = await withUniqueConstraintMapping<OrderRowWithLines>(
      () =>
        resolveClient(this.prisma).order.create({
          data: {
            id: order.id,
            orderNumber: order.orderNumber,
            companyId: order.companyId,
            createdByUserId: order.createdByUserId,
            status: order.status,
            contactName: order.contactName ?? null,
            contactPhone: order.contactPhone ?? null,
            contactEmail: order.contactEmail ?? null,
            ...(order.deliveryAddress !== undefined
              ? { deliveryAddress: order.deliveryAddress as object }
              : {}),
            idempotencyKey: order.idempotencyKey ?? null,
            submittedAt: order.submittedAt ?? null,
            lines: {
              create: lines.map((line) => ({
                orderId: line.orderId,
                productId: line.productId,
                productNameSnapshot: line.productNameSnapshot,
                productSkuSnapshot: line.productSkuSnapshot,
                quantity: line.quantity,
                note: line.note ?? null,
              })),
            },
          },
          include: WITH_LINES_AND_HISTORY,
        }),
      (meta) => {
        throw new IdempotencyConflictError(
          'This Idempotency-Key was already used for a different order.',
          { orderId: order.id, prismaMeta: meta },
        );
      },
    );
    return toDomain(row);
  }

  async listByCompany(
    companyId: string,
    input: { limit?: number; offset?: number } & OrderListFilter = {},
  ): Promise<Page<OrderWithLines>> {
    return this.listWhere({ companyId, ...buildOrderFilterWhere(input) }, input);
  }

  async listAll(
    input: { limit?: number; offset?: number } & OrderListFilter = {},
  ): Promise<Page<OrderWithLines>> {
    return this.listWhere(buildOrderFilterWhere(input), input);
  }

  private async listWhere(
    where: Record<string, unknown>,
    input: { limit?: number; offset?: number; sort?: OrderListFilter['sort'] },
  ): Promise<Page<OrderWithLines>> {
    const { limit, offset } = clampPagination(input);
    const orderBy = {
      createdAt: input.sort === 'createdAt_asc' ? ('asc' as const) : ('desc' as const),
    };
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.order.findMany({
        where,
        include: WITH_LINES_AND_HISTORY,
        orderBy,
        take: limit,
        skip: offset,
      }),
      client.order.count({ where }),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
  }

  async addLine(
    orderId: string,
    expectedVersion: number,
    line: Omit<OrderLine, 'id' | 'orderId'>,
  ): Promise<OrderWithLines> {
    const client = resolveClient(this.prisma);
    const { count } = await client.order.updateMany({
      where: { id: orderId, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Order ${orderId} was modified by another operation (expected version ${expectedVersion}).`,
      { orderId, expectedVersion },
    );
    await client.orderLine.create({
      data: {
        orderId,
        productId: line.productId,
        productNameSnapshot: line.productNameSnapshot,
        productSkuSnapshot: line.productSkuSnapshot,
        quantity: line.quantity,
        note: line.note ?? null,
      },
    });
    return this.requireById(orderId);
  }

  async removeLine(
    orderId: string,
    expectedVersion: number,
    lineId: string,
  ): Promise<OrderWithLines> {
    const client = resolveClient(this.prisma);
    const { count } = await client.order.updateMany({
      where: { id: orderId, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Order ${orderId} was modified by another operation (expected version ${expectedVersion}).`,
      { orderId, expectedVersion },
    );
    await client.orderLine.delete({ where: { id: lineId, orderId } });
    return this.requireById(orderId);
  }

  async transitionStatus(
    orderId: string,
    expectedVersion: number,
    input: {
      readonly toStatus: OrderStatus;
      readonly actorUserId?: string;
      readonly reason?: string;
      readonly idempotencyKey?: string;
      readonly submittedAt?: Date;
    },
  ): Promise<OrderWithLines> {
    const client = resolveClient(this.prisma);
    const current = await client.order.findUnique({ where: { id: orderId } });
    if (!current) {
      throw new ResourceNotFoundError(`Order ${orderId} not found.`, { orderId });
    }

    const { count } = await withUniqueConstraintMapping(
      () =>
        client.order.updateMany({
          where: { id: orderId, version: expectedVersion },
          data: {
            status: input.toStatus,
            version: { increment: 1 },
            ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
            ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
          },
        }),
      (meta) => {
        throw new IdempotencyConflictError(
          'This Idempotency-Key was already used for a different order.',
          { orderId, prismaMeta: meta },
        );
      },
    );
    await assertOptimisticLockAcquired(
      count,
      `Order ${orderId} was modified by another operation (expected version ${expectedVersion}).`,
      { orderId, expectedVersion },
    );
    await client.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: current.status,
        toStatus: input.toStatus,
        actorUserId: input.actorUserId ?? null,
        reason: input.reason ?? null,
      },
    });
    return this.requireById(orderId);
  }

  private async requireById(orderId: string): Promise<OrderWithLines> {
    const updated = await this.findById(orderId);
    if (!updated) {
      throw new ResourceNotFoundError(`Order ${orderId} not found after update.`, { orderId });
    }
    return updated;
  }
}

function buildOrderFilterWhere(input: OrderListFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (input.status !== undefined) {
    where['status'] = input.status;
  }
  if (input.createdFrom !== undefined || input.createdTo !== undefined) {
    where['createdAt'] = {
      ...(input.createdFrom !== undefined ? { gte: input.createdFrom } : {}),
      ...(input.createdTo !== undefined ? { lte: input.createdTo } : {}),
    };
  }
  if (input.companyIds !== undefined) {
    // An empty array must still exclude every order (a customer with no
    // ACTIVE memberships sees nothing) — Prisma's `in: []` already does
    // this correctly, never falls through to "no filter."
    where['companyId'] = { in: input.companyIds };
  }
  return where;
}

function toDomain(row: OrderRowWithLines): OrderWithLines {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    companyId: row.companyId,
    createdByUserId: row.createdByUserId,
    status: row.status,
    contactName: nullToUndefined(row.contactName),
    contactPhone: nullToUndefined(row.contactPhone),
    contactEmail: nullToUndefined(row.contactEmail),
    deliveryAddress: nullableJsonToRecord(row.deliveryAddress),
    idempotencyKey: nullToUndefined(row.idempotencyKey),
    submittedAt: nullToUndefined(row.submittedAt),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    lines: row.lines.map(lineToDomain),
    statusHistory: row.statusHistory.map(historyToDomain),
  };
}

function lineToDomain(row: OrderLineRow): OrderLine {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    productNameSnapshot: row.productNameSnapshot,
    productSkuSnapshot: row.productSkuSnapshot,
    quantity: row.quantity,
    note: nullToUndefined(row.note),
  };
}

function historyToDomain(row: OrderStatusHistoryRow): OrderStatusHistoryEntry {
  return {
    id: row.id,
    orderId: row.orderId,
    fromStatus: nullToUndefined(row.fromStatus),
    toStatus: row.toStatus,
    actorUserId: nullToUndefined(row.actorUserId),
    reason: nullToUndefined(row.reason),
    createdAt: row.createdAt,
  };
}
