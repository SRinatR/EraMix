import type { OrderRepository, OrderWithLines } from '@eramix/application';
import {
  IdempotencyConflictError,
  type Order,
  type OrderLine,
  type OrderStatusHistoryEntry,
} from '@eramix/domain';
import type {
  Order as OrderRow,
  OrderLine as OrderLineRow,
  OrderStatusHistory as OrderStatusHistoryRow,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import { withUniqueConstraintMapping } from '../prisma-error-mapping.js';
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
