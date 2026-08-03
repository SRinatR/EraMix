import {
  AccessDeniedError,
  generateOrderNumber,
  IdempotencyConflictError,
  OrderStateConflictError,
  ResourceNotFoundError,
  parseQuantity,
  type OrderStatus,
  type PlatformRole,
} from '@eramix/domain';
import { assertOrderCompanyAccess, hasPermission, requirePermission } from './authorization.js';
import type { Clock, IdGenerator, UnitOfWork } from './ports.js';
import type {
  AuditEventRepository,
  OrderRepository,
  OrderWithLines,
  OutboxMessageRepository,
  ProductRepository,
} from './repositories.js';

/**
 * State machine (roadmap Phase 5): DRAFT -> SUBMITTED -> UNDER_REVIEW ->
 * WAITING_CONFIRMATION -> CONFIRMED -> IN_PREPARATION ->
 * READY_FOR_PICKUP|READY_FOR_DELIVERY -> COMPLETED, with CANCELLED reachable
 * from any non-terminal state (ORD-007: "Каждый переход статуса проверяется
 * state machine, ролью, текущей version и обязательными данными перехода").
 * COMPLETED/CANCELLED are terminal.
 */
export const ALLOWED_ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['WAITING_CONFIRMATION', 'CANCELLED'],
  WAITING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION: ['READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
  READY_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** ORD-010: customer-initiated cancellation is only allowed before CONFIRMED; after that, manager-only with a reason. */
export const CUSTOMER_CANCELLABLE_STATES: readonly OrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'WAITING_CONFIRMATION',
];

export interface OrderLineInput {
  readonly productId: string;
  readonly quantity: number;
  readonly note?: string;
}

export interface CreateDraftOrderInput {
  readonly companyId: string;
  readonly createdByUserId: string;
  readonly actorCompanyIds: readonly string[];
  readonly contactName?: string;
  readonly contactPhone?: string;
  readonly contactEmail?: string;
  readonly deliveryAddress?: Record<string, unknown>;
  readonly lines: readonly OrderLineInput[];
  readonly traceId?: string;
}

export interface OrderLifecycleDeps {
  readonly orderRepo: OrderRepository;
  readonly productRepo: ProductRepository;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly idGen: IdGenerator;
}

async function snapshotLine(
  productRepo: ProductRepository,
  line: OrderLineInput,
): Promise<{
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  quantity: number;
  note?: string;
}> {
  const product = await productRepo.findById(line.productId);
  if (!product || product.status !== 'PUBLISHED') {
    throw new ResourceNotFoundError(`Product ${line.productId} is not available.`, {
      productId: line.productId,
    });
  }
  const nameTranslation = product.translations[0];
  return {
    productId: product.id,
    productNameSnapshot: nameTranslation?.name ?? product.sku,
    productSkuSnapshot: product.sku,
    quantity: parseQuantity(line.quantity),
    ...(line.note !== undefined ? { note: line.note } : {}),
  };
}

/** ORD-001-ish: draft creation, quote-only (no price snapshot — ADR-0005). */
export async function createDraftOrder(
  deps: Pick<
    OrderLifecycleDeps,
    'orderRepo' | 'productRepo' | 'auditRepo' | 'outboxRepo' | 'uow' | 'idGen'
  >,
  input: CreateDraftOrderInput,
): Promise<OrderWithLines> {
  if (!input.actorCompanyIds.includes(input.companyId)) {
    throw new AccessDeniedError('Actor is not a member of the requested company.', {
      companyId: input.companyId,
    });
  }
  if (input.lines.length === 0) {
    throw new OrderStateConflictError('A draft order must have at least one line.', {});
  }

  const lines = await Promise.all(input.lines.map((line) => snapshotLine(deps.productRepo, line)));

  const orderId = await deps.idGen.nextId();

  return deps.uow.runInTransaction(async () => {
    const order = await deps.orderRepo.create(
      {
        id: orderId,
        orderNumber: generateOrderNumber(),
        companyId: input.companyId,
        createdByUserId: input.createdByUserId,
        status: 'DRAFT',
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress } : {}),
      },
      lines.map((line) => ({ ...line, orderId })),
    );
    await deps.auditRepo.record({
      actorUserId: input.createdByUserId,
      action: 'order.created',
      entityType: 'Order',
      entityId: order.id,
      metadata: { companyId: input.companyId, lineCount: lines.length },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Order',
      aggregateId: order.id,
      eventType: 'order.created',
      payload: { orderNumber: order.orderNumber, companyId: input.companyId },
    });
    return order;
  });
}

async function loadDraftOrderForCompanyActor(
  orderRepo: OrderRepository,
  orderId: string,
  actorCompanyIds: readonly string[],
): Promise<OrderWithLines> {
  const order = await orderRepo.findById(orderId);
  if (!order) {
    throw new ResourceNotFoundError(`Order ${orderId} not found.`, { orderId });
  }
  if (!actorCompanyIds.includes(order.companyId)) {
    throw new AccessDeniedError('Order does not belong to a company the actor is a member of.', {
      orderId,
    });
  }
  if (order.status !== 'DRAFT') {
    // ORD-006: "После SUBMITTED клиент не меняет состав заказа напрямую."
    throw new OrderStateConflictError('Order lines can only be changed while the order is DRAFT.', {
      orderId,
      status: order.status,
    });
  }
  return order;
}

export async function addOrderLine(
  deps: Pick<OrderLifecycleDeps, 'orderRepo' | 'productRepo' | 'auditRepo'>,
  input: {
    readonly orderId: string;
    readonly expectedVersion: number;
    readonly line: OrderLineInput;
    readonly actorUserId: string;
    readonly actorCompanyIds: readonly string[];
    readonly traceId?: string;
  },
): Promise<OrderWithLines> {
  await loadDraftOrderForCompanyActor(deps.orderRepo, input.orderId, input.actorCompanyIds);
  const snapshot = await snapshotLine(deps.productRepo, input.line);
  const order = await deps.orderRepo.addLine(input.orderId, input.expectedVersion, snapshot);
  await deps.auditRepo.record({
    actorUserId: input.actorUserId,
    action: 'order.line_added',
    entityType: 'Order',
    entityId: input.orderId,
    metadata: { productId: input.line.productId, quantity: input.line.quantity },
    traceId: input.traceId,
  });
  return order;
}

export async function removeOrderLine(
  deps: Pick<OrderLifecycleDeps, 'orderRepo' | 'auditRepo'>,
  input: {
    readonly orderId: string;
    readonly expectedVersion: number;
    readonly lineId: string;
    readonly actorUserId: string;
    readonly actorCompanyIds: readonly string[];
    readonly traceId?: string;
  },
): Promise<OrderWithLines> {
  await loadDraftOrderForCompanyActor(deps.orderRepo, input.orderId, input.actorCompanyIds);
  const order = await deps.orderRepo.removeLine(input.orderId, input.expectedVersion, input.lineId);
  await deps.auditRepo.record({
    actorUserId: input.actorUserId,
    action: 'order.line_removed',
    entityType: 'Order',
    entityId: input.orderId,
    metadata: { lineId: input.lineId },
    traceId: input.traceId,
  });
  return order;
}

/**
 * DRAFT -> SUBMITTED, gated by an Idempotency-Key so retried submit requests
 * (network retry, double-click) are safe: replaying the same key against the
 * same order returns the already-submitted order unchanged; reusing the key
 * for a different order is an IdempotencyConflictError.
 */
export async function submitOrder(
  deps: Pick<OrderLifecycleDeps, 'orderRepo' | 'auditRepo' | 'outboxRepo' | 'uow' | 'clock'>,
  input: {
    readonly orderId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly actorUserId: string;
    readonly actorCompanyIds: readonly string[];
    readonly traceId?: string;
  },
): Promise<OrderWithLines> {
  const existingByKey = await deps.orderRepo.findByIdempotencyKey(input.idempotencyKey);
  if (existingByKey) {
    if (existingByKey.id !== input.orderId) {
      throw new IdempotencyConflictError(
        'This Idempotency-Key was already used for a different order.',
        { idempotencyKey: input.idempotencyKey, orderId: input.orderId },
      );
    }
    return existingByKey;
  }

  const order = await loadDraftOrderForCompanyActor(
    deps.orderRepo,
    input.orderId,
    input.actorCompanyIds,
  );
  if (order.lines.length === 0) {
    throw new OrderStateConflictError('Cannot submit an order with no lines.', {
      orderId: input.orderId,
    });
  }

  return deps.uow.runInTransaction(async () => {
    const updated = await deps.orderRepo.transitionStatus(input.orderId, input.expectedVersion, {
      toStatus: 'SUBMITTED',
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      submittedAt: deps.clock.now(),
    });
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'order.submitted',
      entityType: 'Order',
      entityId: input.orderId,
      metadata: { idempotencyKey: input.idempotencyKey },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Order',
      aggregateId: input.orderId,
      eventType: 'order.submitted',
      payload: { orderNumber: updated.orderNumber, companyId: updated.companyId },
    });
    return updated;
  });
}

export interface TransitionOrderStatusInput {
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly toStatus: OrderStatus;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly actorCompanyIds: readonly string[];
  readonly reason?: string;
  readonly traceId?: string;
}

/**
 * All transitions except the customer's own SUBMITTED->CANCELLED /
 * DRAFT->CANCELLED / etc. (pre-CONFIRMED cancellation, ORD-010) require the
 * `order.transition` permission (manager/admin) — ORD-007's "ролью" check.
 */
export async function transitionOrderStatus(
  deps: Pick<OrderLifecycleDeps, 'orderRepo' | 'auditRepo' | 'outboxRepo' | 'uow'>,
  input: TransitionOrderStatusInput,
): Promise<OrderWithLines> {
  const order = await deps.orderRepo.findById(input.orderId);
  if (!order) {
    throw new ResourceNotFoundError(`Order ${input.orderId} not found.`, {
      orderId: input.orderId,
    });
  }

  assertOrderCompanyAccess(input.actorRole, input.actorCompanyIds, order.companyId);

  const allowed = ALLOWED_ORDER_TRANSITIONS[order.status];
  if (!allowed.includes(input.toStatus)) {
    throw new OrderStateConflictError(
      `Order ${input.orderId} cannot transition from ${order.status} to ${input.toStatus}.`,
      { orderId: input.orderId, from: order.status, to: input.toStatus },
    );
  }

  const isCustomerOwnCancellation =
    input.toStatus === 'CANCELLED' && CUSTOMER_CANCELLABLE_STATES.includes(order.status);

  if (!isCustomerOwnCancellation) {
    requirePermission(input.actorRole, 'order.transition');
  } else if (!hasPermission(input.actorRole, 'order.transition')) {
    // Customer path: must own the order (already checked by
    // assertOrderCompanyAccess above) and hold at least order.read.own.
    requirePermission(input.actorRole, 'order.read.own');
  }

  if (input.toStatus === 'CANCELLED' && !CUSTOMER_CANCELLABLE_STATES.includes(order.status)) {
    // Post-CONFIRMED cancellation always needs a manager/admin and a reason (ORD-010).
    requirePermission(input.actorRole, 'order.transition');
    if (!input.reason) {
      throw new OrderStateConflictError('Cancelling a confirmed order requires a reason.', {
        orderId: input.orderId,
        status: order.status,
      });
    }
  }

  return deps.uow.runInTransaction(async () => {
    const updated = await deps.orderRepo.transitionStatus(input.orderId, input.expectedVersion, {
      toStatus: input.toStatus,
      actorUserId: input.actorUserId,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'order.status_transitioned',
      entityType: 'Order',
      entityId: input.orderId,
      metadata: { from: order.status, to: input.toStatus, reason: input.reason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Order',
      aggregateId: input.orderId,
      eventType: 'order.status_transitioned',
      payload: { orderNumber: updated.orderNumber, from: order.status, to: input.toStatus },
    });
    return updated;
  });
}
