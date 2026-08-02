import {
  AccessDeniedError,
  ConcurrencyConflictError,
  IdempotencyConflictError,
  OrderStateConflictError,
} from '@eramix/domain';
import type {
  Order,
  OrderLine,
  OrderStatus,
  OrderStatusHistoryEntry,
  ProductTranslation,
} from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ORDER_TRANSITIONS,
  CUSTOMER_CANCELLABLE_STATES,
  addOrderLine,
  createDraftOrder,
  submitOrder,
  transitionOrderStatus,
} from './order-lifecycle.js';
import type { CursorPage } from './pagination.js';
import type {
  AuditEventRepository,
  OrderRepository,
  OrderWithLines,
  OutboxMessageRepository,
  ProductRepository,
  ProductWithTranslations,
} from './repositories.js';

class InMemoryUnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class FixedClock {
  now(): Date {
    return new Date('2026-08-01T00:00:00Z');
  }
}

class SequentialIdGenerator {
  private counter = 0;
  nextId(): string {
    return `id-${++this.counter}`;
  }
}

function fakeAuditRepo(): AuditEventRepository {
  return {
    record: (event) => Promise.resolve({ id: 'audit-1', createdAt: new Date(), ...event }),
    listByEntity: () => Promise.resolve({ data: [], page: { hasMore: false } }),
  };
}

function fakeOutboxRepo(): OutboxMessageRepository {
  return {
    enqueue: (message) =>
      Promise.resolve({
        id: 'outbox-1',
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        ...message,
      }),
    claimPending: () => Promise.resolve([]),
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
    markDeadLetter: () => Promise.resolve(),
  };
}

class InMemoryProductRepository implements Pick<ProductRepository, 'findById'> {
  constructor(private readonly products: Map<string, ProductWithTranslations>) {}
  findById(id: string): Promise<ProductWithTranslations | undefined> {
    return Promise.resolve(this.products.get(id));
  }
}

function makeProduct(id: string, name: string): ProductWithTranslations {
  const translation: ProductTranslation = {
    id: `${id}-t`,
    productId: id,
    locale: 'en',
    name,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    id,
    publicId: `PUB${id}`,
    sku: `SKU-${id}`,
    categoryId: 'category-1',
    status: 'PUBLISHED',
    directSaleEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations: [translation],
  };
}

class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, OrderWithLines>();

  seed(order: OrderWithLines): void {
    this.orders.set(order.id, order);
  }

  findById(id: string): Promise<OrderWithLines | undefined> {
    return Promise.resolve(this.orders.get(id));
  }

  findByOrderNumber(orderNumber: string): Promise<OrderWithLines | undefined> {
    return Promise.resolve([...this.orders.values()].find((o) => o.orderNumber === orderNumber));
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<OrderWithLines | undefined> {
    return Promise.resolve(
      [...this.orders.values()].find((o) => o.idempotencyKey === idempotencyKey),
    );
  }

  listByCompany(companyId: string): Promise<CursorPage<OrderWithLines>> {
    const data = [...this.orders.values()].filter((o) => o.companyId === companyId);
    return Promise.resolve({ data, page: { hasMore: false } });
  }

  listAll(): Promise<CursorPage<OrderWithLines>> {
    const data = [...this.orders.values()];
    return Promise.resolve({ data, page: { hasMore: false } });
  }

  create(
    order: Omit<Order, 'version' | 'createdAt' | 'updatedAt'>,
    lines: readonly Omit<OrderLine, 'id'>[],
  ): Promise<OrderWithLines> {
    const created: OrderWithLines = {
      ...order,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      lines: lines.map((line, index) => ({ ...line, id: `line-${index}` })),
      statusHistory: [],
    };
    this.orders.set(created.id, created);
    return Promise.resolve(created);
  }

  addLine(
    orderId: string,
    expectedVersion: number,
    line: Omit<OrderLine, 'id' | 'orderId'>,
  ): Promise<OrderWithLines> {
    const order = this.requireVersion(orderId, expectedVersion);
    const updated: OrderWithLines = {
      ...order,
      version: order.version + 1,
      lines: [...order.lines, { ...line, id: `line-${order.lines.length}`, orderId }],
    };
    this.orders.set(orderId, updated);
    return Promise.resolve(updated);
  }

  removeLine(orderId: string, expectedVersion: number, lineId: string): Promise<OrderWithLines> {
    const order = this.requireVersion(orderId, expectedVersion);
    const updated: OrderWithLines = {
      ...order,
      version: order.version + 1,
      lines: order.lines.filter((line) => line.id !== lineId),
    };
    this.orders.set(orderId, updated);
    return Promise.resolve(updated);
  }

  transitionStatus(
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
    if (input.idempotencyKey !== undefined) {
      const conflict = [...this.orders.values()].find(
        (o) => o.idempotencyKey === input.idempotencyKey && o.id !== orderId,
      );
      if (conflict) {
        throw new IdempotencyConflictError('Idempotency-Key reused for a different order.', {
          orderId,
        });
      }
    }
    const order = this.requireVersion(orderId, expectedVersion);
    const historyEntry: OrderStatusHistoryEntry = {
      id: `history-${order.statusHistory.length}`,
      orderId,
      fromStatus: order.status,
      toStatus: input.toStatus,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      createdAt: new Date(),
    };
    const updated: OrderWithLines = {
      ...order,
      status: input.toStatus,
      version: order.version + 1,
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
      statusHistory: [...order.statusHistory, historyEntry],
    };
    this.orders.set(orderId, updated);
    return Promise.resolve(updated);
  }

  private requireVersion(orderId: string, expectedVersion: number): OrderWithLines {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found in test fixture.`);
    }
    if (order.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`Order ${orderId} version mismatch.`, { orderId });
    }
    return order;
  }
}

function baseOrder(overrides: Partial<OrderWithLines> = {}): OrderWithLines {
  return {
    id: 'order-1',
    orderNumber: 'ORD-TEST',
    companyId: 'company-a',
    createdByUserId: 'user-1',
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    lines: [
      {
        id: 'line-0',
        orderId: 'order-1',
        productId: 'product-1',
        productNameSnapshot: 'Costume',
        productSkuSnapshot: 'SKU-1',
        quantity: 1,
      },
    ],
    statusHistory: [],
    ...overrides,
  };
}

describe('ALLOWED_ORDER_TRANSITIONS', () => {
  it('has no transition out of the two terminal states', () => {
    expect(ALLOWED_ORDER_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ALLOWED_ORDER_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('allows CANCELLED from every non-terminal state', () => {
    for (const status of Object.keys(ALLOWED_ORDER_TRANSITIONS) as OrderStatus[]) {
      if (status === 'COMPLETED' || status === 'CANCELLED') continue;
      expect(ALLOWED_ORDER_TRANSITIONS[status]).toContain('CANCELLED');
    }
  });
});

describe('createDraftOrder', () => {
  it('denies creating an order for a company the actor is not a member of', async () => {
    const products = new Map([['product-1', makeProduct('product-1', 'Costume')]]);
    await expect(
      createDraftOrder(
        {
          orderRepo: new InMemoryOrderRepository(),
          productRepo: new InMemoryProductRepository(products) as unknown as ProductRepository,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
        },
        {
          companyId: 'company-a',
          createdByUserId: 'user-1',
          actorCompanyIds: ['company-b'],
          lines: [{ productId: 'product-1', quantity: 1 }],
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('creates a DRAFT order with a snapshot of the product name/sku (quote-only, no price)', async () => {
    const products = new Map([['product-1', makeProduct('product-1', 'Costume')]]);
    const order = await createDraftOrder(
      {
        orderRepo: new InMemoryOrderRepository(),
        productRepo: new InMemoryProductRepository(products) as unknown as ProductRepository,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
      },
      {
        companyId: 'company-a',
        createdByUserId: 'user-1',
        actorCompanyIds: ['company-a'],
        lines: [{ productId: 'product-1', quantity: 2 }],
      },
    );
    expect(order.status).toBe('DRAFT');
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({
      productNameSnapshot: 'Costume',
      productSkuSnapshot: 'SKU-product-1',
      quantity: 2,
    });
    expect(order).not.toHaveProperty('priceMinor');
  });
});

describe('addOrderLine', () => {
  it('rejects adding a line once the order is no longer DRAFT (ORD-006)', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'SUBMITTED' }));
    const products = new Map([['product-1', makeProduct('product-1', 'Costume')]]);
    await expect(
      addOrderLine(
        {
          orderRepo,
          productRepo: new InMemoryProductRepository(products) as unknown as ProductRepository,
          auditRepo: fakeAuditRepo(),
        },
        {
          orderId: 'order-1',
          expectedVersion: 0,
          line: { productId: 'product-1', quantity: 1 },
          actorUserId: 'user-1',
          actorCompanyIds: ['company-a'],
        },
      ),
    ).rejects.toThrow(OrderStateConflictError);
  });
});

describe('submitOrder', () => {
  it('transitions DRAFT -> SUBMITTED and sets the idempotency key + submittedAt', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder());
    const order = await submitOrder(
      {
        orderRepo,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
        clock: new FixedClock(),
      },
      {
        orderId: 'order-1',
        expectedVersion: 0,
        idempotencyKey: 'key-1',
        actorUserId: 'user-1',
        actorCompanyIds: ['company-a'],
      },
    );
    expect(order.status).toBe('SUBMITTED');
    expect(order.idempotencyKey).toBe('key-1');
  });

  it('replaying the same Idempotency-Key against the same order returns the existing order without a second transition', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder());
    const deps = {
      orderRepo,
      auditRepo: fakeAuditRepo(),
      outboxRepo: fakeOutboxRepo(),
      uow: new InMemoryUnitOfWork(),
      clock: new FixedClock(),
    };
    const input = {
      orderId: 'order-1',
      expectedVersion: 0,
      idempotencyKey: 'key-1',
      actorUserId: 'user-1',
      actorCompanyIds: ['company-a'],
    };
    const first = await submitOrder(deps, input);
    const second = await submitOrder(deps, input);
    expect(second).toEqual(first);
    expect(second.version).toBe(first.version);
  });

  it('reusing the same Idempotency-Key for a different order throws IdempotencyConflictError', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ id: 'order-1', idempotencyKey: 'key-1', status: 'SUBMITTED' }));
    orderRepo.seed(baseOrder({ id: 'order-2' }));
    await expect(
      submitOrder(
        {
          orderRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          clock: new FixedClock(),
        },
        {
          orderId: 'order-2',
          expectedVersion: 0,
          idempotencyKey: 'key-1',
          actorUserId: 'user-1',
          actorCompanyIds: ['company-a'],
        },
      ),
    ).rejects.toThrow(IdempotencyConflictError);
  });
});

describe('transitionOrderStatus', () => {
  it('rejects a transition not in the state machine', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'DRAFT' }));
    await expect(
      transitionOrderStatus(
        {
          orderRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          orderId: 'order-1',
          expectedVersion: 0,
          toStatus: 'COMPLETED',
          actorUserId: 'manager-1',
          actorRole: 'MANAGER',
          actorCompanyIds: [],
        },
      ),
    ).rejects.toThrow(OrderStateConflictError);
  });

  it('allows a customer to cancel their own DRAFT order without order.transition', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'DRAFT' }));
    const result = await transitionOrderStatus(
      {
        orderRepo,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        orderId: 'order-1',
        expectedVersion: 0,
        toStatus: 'CANCELLED',
        actorUserId: 'user-1',
        actorRole: 'CUSTOMER',
        actorCompanyIds: ['company-a'],
      },
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('denies a customer forcing a forward transition (UNDER_REVIEW requires order.transition)', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'SUBMITTED' }));
    await expect(
      transitionOrderStatus(
        {
          orderRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          orderId: 'order-1',
          expectedVersion: 0,
          toStatus: 'UNDER_REVIEW',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
          actorCompanyIds: ['company-a'],
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('denies a customer cancelling a CONFIRMED order (ORD-010: manager-only past CONFIRMED)', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'CONFIRMED' }));
    await expect(
      transitionOrderStatus(
        {
          orderRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          orderId: 'order-1',
          expectedVersion: 0,
          toStatus: 'CANCELLED',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
          actorCompanyIds: ['company-a'],
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('requires a reason when a manager cancels a CONFIRMED order (ORD-010)', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'CONFIRMED' }));
    await expect(
      transitionOrderStatus(
        {
          orderRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          orderId: 'order-1',
          expectedVersion: 0,
          toStatus: 'CANCELLED',
          actorUserId: 'manager-1',
          actorRole: 'MANAGER',
          actorCompanyIds: [],
        },
      ),
    ).rejects.toThrow(OrderStateConflictError);
  });

  it('allows a manager to cancel a CONFIRMED order when a reason is given', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'CONFIRMED' }));
    const result = await transitionOrderStatus(
      {
        orderRepo,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        orderId: 'order-1',
        expectedVersion: 0,
        toStatus: 'CANCELLED',
        actorUserId: 'manager-1',
        actorRole: 'MANAGER',
        actorCompanyIds: [],
        reason: 'Out of stock',
      },
    );
    expect(result.status).toBe('CANCELLED');
    expect(result.statusHistory[0]).toMatchObject({ reason: 'Out of stock' });
  });

  it('a manager transitioning a stale version throws ConcurrencyConflictError', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'SUBMITTED', version: 3 }));
    await expect(
      transitionOrderStatus(
        {
          orderRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          orderId: 'order-1',
          expectedVersion: 0,
          toStatus: 'UNDER_REVIEW',
          actorUserId: 'manager-1',
          actorRole: 'MANAGER',
          actorCompanyIds: [],
        },
      ),
    ).rejects.toThrow(ConcurrencyConflictError);
  });

  it('denies a manager acting on an order response returns RFC 9457 conflict for an invalid transition (TZ: "недопустимый переход возвращает RFC 9457 conflict")', async () => {
    const orderRepo = new InMemoryOrderRepository();
    orderRepo.seed(baseOrder({ status: 'COMPLETED' }));
    await expect(
      transitionOrderStatus(
        {
          orderRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          orderId: 'order-1',
          expectedVersion: 0,
          toStatus: 'CANCELLED',
          actorUserId: 'manager-1',
          actorRole: 'MANAGER',
          actorCompanyIds: [],
        },
      ),
    ).rejects.toThrow(OrderStateConflictError);
  });
});

describe('CUSTOMER_CANCELLABLE_STATES', () => {
  it('does not include CONFIRMED or later states', () => {
    expect(CUSTOMER_CANCELLABLE_STATES).not.toContain('CONFIRMED');
    expect(CUSTOMER_CANCELLABLE_STATES).not.toContain('IN_PREPARATION');
  });
});
