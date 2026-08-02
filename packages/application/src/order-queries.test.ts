import { AccessDeniedError } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { listOrdersForActor } from './order-queries.js';
import type { CursorPage } from './pagination.js';
import type { OrderRepository, OrderWithLines } from './repositories.js';

function makeOrder(id: string, companyId: string): OrderWithLines {
  return {
    id,
    orderNumber: `ORD-${id}`,
    companyId,
    createdByUserId: 'user-1',
    status: 'DRAFT',
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lines: [],
    statusHistory: [],
  };
}

/** Records the exact `companyIds` filter it was called with, for assertions — the real correctness question here is "what did the repository get asked for," not the fake data shape. */
class RecordingOrderRepository implements Pick<OrderRepository, 'listAll'> {
  public lastCompanyIdsFilter: readonly string[] | undefined;
  constructor(private readonly orders: readonly OrderWithLines[]) {}

  listAll(input: { companyIds?: readonly string[] } = {}): Promise<CursorPage<OrderWithLines>> {
    this.lastCompanyIdsFilter = input.companyIds;
    const data =
      input.companyIds === undefined
        ? this.orders
        : this.orders.filter((order) => input.companyIds?.includes(order.companyId));
    return Promise.resolve({ data, page: { hasMore: false } });
  }
}

describe('listOrdersForActor', () => {
  it('a one-company customer sees only their own company, no filter needed', async () => {
    const repo = new RecordingOrderRepository([
      makeOrder('1', 'company-a'),
      makeOrder('2', 'company-b'),
    ]);

    const result = await listOrdersForActor(repo, {
      actorRole: 'CUSTOMER',
      actorCompanyIds: ['company-a'],
    });

    expect(repo.lastCompanyIdsFilter).toEqual(['company-a']);
    expect(result.data.map((o) => o.id)).toEqual(['1']);
  });

  it('a multi-company customer sees every ACTIVE company by default (true cross-company page, never narrowed silently)', async () => {
    const repo = new RecordingOrderRepository([
      makeOrder('1', 'company-a'),
      makeOrder('2', 'company-b'),
      makeOrder('3', 'company-c'),
    ]);

    const result = await listOrdersForActor(repo, {
      actorRole: 'CUSTOMER',
      actorCompanyIds: ['company-a', 'company-b'],
    });

    expect(repo.lastCompanyIdsFilter).toEqual(['company-a', 'company-b']);
    expect(result.data.map((o) => o.id).sort()).toEqual(['1', '2']);
  });

  it('an explicit companyId filter narrows to exactly that company when it is one of the actor’s memberships', async () => {
    const repo = new RecordingOrderRepository([
      makeOrder('1', 'company-a'),
      makeOrder('2', 'company-b'),
    ]);

    const result = await listOrdersForActor(repo, {
      actorRole: 'CUSTOMER',
      actorCompanyIds: ['company-a', 'company-b'],
      companyId: 'company-b',
    });

    expect(repo.lastCompanyIdsFilter).toEqual(['company-b']);
    expect(result.data.map((o) => o.id)).toEqual(['2']);
  });

  it('rejects an explicit companyId filter for a company the actor does not belong to (unauthorized company)', async () => {
    const repo = new RecordingOrderRepository([makeOrder('1', 'company-a')]);

    await expect(
      listOrdersForActor(repo, {
        actorRole: 'CUSTOMER',
        actorCompanyIds: ['company-a'],
        companyId: 'company-x',
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('rejects a company filter left over from a revoked membership (empty actorCompanyIds means no access)', async () => {
    const repo = new RecordingOrderRepository([makeOrder('1', 'company-a')]);

    // Simulates the exact revocation scenario: the caller once belonged to
    // company-a, but the live membership lookup (apps/web/src/server/
    // session.ts) no longer includes it because it was revoked.
    await expect(
      listOrdersForActor(repo, {
        actorRole: 'CUSTOMER',
        actorCompanyIds: [],
        companyId: 'company-a',
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    const unfiltered = await listOrdersForActor(repo, {
      actorRole: 'CUSTOMER',
      actorCompanyIds: [],
    });
    expect(repo.lastCompanyIdsFilter).toEqual([]);
    expect(unfiltered.data).toEqual([]);
  });

  it('a manager/admin (order.read.all) sees every company unrestricted, with no companyId filter', async () => {
    const repo = new RecordingOrderRepository([
      makeOrder('1', 'company-a'),
      makeOrder('2', 'company-b'),
    ]);

    const result = await listOrdersForActor(repo, {
      actorRole: 'ADMIN',
      actorCompanyIds: [],
    });

    expect(repo.lastCompanyIdsFilter).toBeUndefined();
    expect(result.data).toHaveLength(2);
  });

  it('a manager/admin may still filter to one company explicitly, without an ownership check', async () => {
    const repo = new RecordingOrderRepository([
      makeOrder('1', 'company-a'),
      makeOrder('2', 'company-b'),
    ]);

    const result = await listOrdersForActor(repo, {
      actorRole: 'MANAGER',
      actorCompanyIds: [],
      companyId: 'company-b',
    });

    expect(repo.lastCompanyIdsFilter).toEqual(['company-b']);
    expect(result.data.map((o) => o.id)).toEqual(['2']);
  });

  it('passes pagination/status/sort filters through untouched alongside the company scope', async () => {
    const repo = new RecordingOrderRepository([]);
    let capturedInput: unknown;
    const capturingRepo: Pick<OrderRepository, 'listAll'> = {
      listAll: (input) => {
        capturedInput = input;
        return repo.listAll(input);
      },
    };

    await listOrdersForActor(capturingRepo, {
      actorRole: 'CUSTOMER',
      actorCompanyIds: ['company-a'],
      status: 'SUBMITTED',
      sort: 'createdAt_asc',
      limit: 10,
      cursor: 'opaque-cursor',
    });

    expect(capturedInput).toEqual({
      status: 'SUBMITTED',
      sort: 'createdAt_asc',
      limit: 10,
      cursor: 'opaque-cursor',
      companyIds: ['company-a'],
    });
  });
});
