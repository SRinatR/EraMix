import { AccessDeniedError, ValidationFailedError } from '@eramix/domain';
import type {
  Order,
  OrderComment,
  OrderLine,
  OrderStatus,
  OrderStatusHistoryEntry,
} from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import {
  addOrderComment,
  listOrderCommentsForActor,
  visibleOrderComments,
} from './order-comments.js';
import type { CursorPage } from './pagination.js';
import type {
  AuditEventRepository,
  OrderCommentRepository,
  OrderRepository,
  OrderWithLines,
} from './repositories.js';

class SequentialIdGenerator {
  private counter = 0;
  async nextId(): Promise<string> {
    return `comment-${++this.counter}`;
  }
}

function fakeAuditRepo(): AuditEventRepository {
  return {
    record: (event) => Promise.resolve({ id: 'audit-1', createdAt: new Date(), ...event }),
    listByEntity: () => Promise.resolve({ data: [], page: { hasMore: false } }),
  };
}

class InMemoryOrderRepository implements OrderRepository {
  constructor(private readonly orders: Map<string, OrderWithLines>) {}

  findById(id: string): Promise<OrderWithLines | undefined> {
    return Promise.resolve(this.orders.get(id));
  }
  findByOrderNumber(): Promise<OrderWithLines | undefined> {
    return Promise.resolve(undefined);
  }
  findByIdempotencyKey(): Promise<OrderWithLines | undefined> {
    return Promise.resolve(undefined);
  }
  listByCompany(): Promise<CursorPage<OrderWithLines>> {
    return Promise.resolve({ data: [], page: { hasMore: false } });
  }
  listAll(): Promise<CursorPage<OrderWithLines>> {
    return Promise.resolve({ data: [], page: { hasMore: false } });
  }
  create(): Promise<OrderWithLines> {
    throw new Error('not implemented');
  }
  addLine(): Promise<OrderWithLines> {
    throw new Error('not implemented');
  }
  removeLine(): Promise<OrderWithLines> {
    throw new Error('not implemented');
  }
  transitionStatus(): Promise<OrderWithLines> {
    throw new Error('not implemented');
  }
}

class InMemoryOrderCommentRepository implements OrderCommentRepository {
  private readonly comments: OrderComment[] = [];

  listByOrder(orderId: string): Promise<readonly OrderComment[]> {
    return Promise.resolve(this.comments.filter((c) => c.orderId === orderId));
  }

  create(comment: Omit<OrderComment, 'createdAt'>): Promise<OrderComment> {
    const created: OrderComment = { ...comment, createdAt: new Date() };
    this.comments.push(created);
    return Promise.resolve(created);
  }
}

function makeOrder(id: string, companyId: string, status: OrderStatus = 'DRAFT'): OrderWithLines {
  const order: Order = {
    id,
    orderNumber: `ORD-${id}`,
    companyId,
    createdByUserId: 'user-1',
    status,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const lines: readonly OrderLine[] = [];
  const statusHistory: readonly OrderStatusHistoryEntry[] = [];
  return { ...order, lines, statusHistory };
}

describe('addOrderComment', () => {
  it('lets a company member add a PUBLIC comment (ORD-008/ACC-004)', async () => {
    const orderRepo = new InMemoryOrderRepository(
      new Map([['order-1', makeOrder('order-1', 'company-1')]]),
    );
    const commentRepo = new InMemoryOrderCommentRepository();

    const comment = await addOrderComment(
      { orderRepo, commentRepo, auditRepo: fakeAuditRepo(), idGen: new SequentialIdGenerator() },
      {
        orderId: 'order-1',
        body: 'When will this ship?',
        visibility: 'PUBLIC',
        actorUserId: 'user-1',
        actorRole: 'CUSTOMER',
        actorCompanyIds: ['company-1'],
      },
    );

    expect(comment.visibility).toBe('PUBLIC');
    expect(comment.body).toBe('When will this ship?');
    expect(await commentRepo.listByOrder('order-1')).toHaveLength(1);
  });

  it('rejects a CUSTOMER writing an INTERNAL comment', async () => {
    const orderRepo = new InMemoryOrderRepository(
      new Map([['order-1', makeOrder('order-1', 'company-1')]]),
    );
    const commentRepo = new InMemoryOrderCommentRepository();

    await expect(
      addOrderComment(
        { orderRepo, commentRepo, auditRepo: fakeAuditRepo(), idGen: new SequentialIdGenerator() },
        {
          orderId: 'order-1',
          body: 'internal note',
          visibility: 'INTERNAL',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
          actorCompanyIds: ['company-1'],
        },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('lets a MANAGER write an INTERNAL comment', async () => {
    const orderRepo = new InMemoryOrderRepository(
      new Map([['order-1', makeOrder('order-1', 'company-1')]]),
    );
    const commentRepo = new InMemoryOrderCommentRepository();

    const comment = await addOrderComment(
      { orderRepo, commentRepo, auditRepo: fakeAuditRepo(), idGen: new SequentialIdGenerator() },
      {
        orderId: 'order-1',
        body: 'manager-only note',
        visibility: 'INTERNAL',
        actorUserId: 'manager-1',
        actorRole: 'MANAGER',
        actorCompanyIds: [],
      },
    );

    expect(comment.visibility).toBe('INTERNAL');
  });

  it('rejects a blank comment body', async () => {
    const orderRepo = new InMemoryOrderRepository(
      new Map([['order-1', makeOrder('order-1', 'company-1')]]),
    );
    const commentRepo = new InMemoryOrderCommentRepository();

    await expect(
      addOrderComment(
        { orderRepo, commentRepo, auditRepo: fakeAuditRepo(), idGen: new SequentialIdGenerator() },
        {
          orderId: 'order-1',
          body: '   ',
          visibility: 'PUBLIC',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
          actorCompanyIds: ['company-1'],
        },
      ),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('denies a customer from a different company (ORD-008 boundary)', async () => {
    const orderRepo = new InMemoryOrderRepository(
      new Map([['order-1', makeOrder('order-1', 'company-1')]]),
    );
    const commentRepo = new InMemoryOrderCommentRepository();

    await expect(
      addOrderComment(
        { orderRepo, commentRepo, auditRepo: fakeAuditRepo(), idGen: new SequentialIdGenerator() },
        {
          orderId: 'order-1',
          body: 'not my order',
          visibility: 'PUBLIC',
          actorUserId: 'user-2',
          actorRole: 'CUSTOMER',
          actorCompanyIds: ['company-2'],
        },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe('visibleOrderComments', () => {
  const comments: readonly OrderComment[] = [
    {
      id: 'c1',
      orderId: 'order-1',
      authorId: 'u1',
      visibility: 'PUBLIC',
      body: 'public',
      createdAt: new Date(),
    },
    {
      id: 'c2',
      orderId: 'order-1',
      authorId: 'm1',
      visibility: 'INTERNAL',
      body: 'internal',
      createdAt: new Date(),
    },
  ];

  it('hides INTERNAL comments from a CUSTOMER', () => {
    expect(visibleOrderComments(comments, 'CUSTOMER')).toEqual([comments[0]]);
  });

  it('shows every comment to a MANAGER', () => {
    expect(visibleOrderComments(comments, 'MANAGER')).toEqual(comments);
  });
});

describe('listOrderCommentsForActor', () => {
  it('filters INTERNAL comments for a customer reading their own order', async () => {
    const orderRepo = new InMemoryOrderRepository(
      new Map([['order-1', makeOrder('order-1', 'company-1')]]),
    );
    const commentRepo = new InMemoryOrderCommentRepository();
    await commentRepo.create({
      id: 'c1',
      orderId: 'order-1',
      authorId: 'u1',
      visibility: 'PUBLIC',
      body: 'hi',
    });
    await commentRepo.create({
      id: 'c2',
      orderId: 'order-1',
      authorId: 'm1',
      visibility: 'INTERNAL',
      body: 'internal note',
    });

    const result = await listOrderCommentsForActor(
      { orderRepo, commentRepo },
      { orderId: 'order-1', actorRole: 'CUSTOMER', actorCompanyIds: ['company-1'] },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.visibility).toBe('PUBLIC');
  });

  it('denies access to an order outside the actor company', async () => {
    const orderRepo = new InMemoryOrderRepository(
      new Map([['order-1', makeOrder('order-1', 'company-1')]]),
    );
    const commentRepo = new InMemoryOrderCommentRepository();

    await expect(
      listOrderCommentsForActor(
        { orderRepo, commentRepo },
        { orderId: 'order-1', actorRole: 'CUSTOMER', actorCompanyIds: ['company-2'] },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
