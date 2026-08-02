import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  type CursorPage,
  type CursorPaginationInput,
  type MembershipListFilter,
  type MembershipRepository,
} from '@eramix/application';
import { ResourceNotFoundError, type Membership } from '@eramix/domain';
import type { Membership as MembershipRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import {
  buildCursorOrderBy,
  combineWithCursor,
  cursorValueOf,
  type SortSpec,
} from './cursor-query.js';
import { assertOptimisticLockAcquired } from '../prisma-error-mapping.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Membership | undefined> {
    const row = await resolveClient(this.prisma).membership.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findByUserAndCompany(userId: string, companyId: string): Promise<Membership | undefined> {
    const row = await resolveClient(this.prisma).membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    return row ? toDomain(row) : undefined;
  }

  async listByUser(userId: string): Promise<readonly Membership[]> {
    const rows = await resolveClient(this.prisma).membership.findMany({ where: { userId } });
    return rows.map(toDomain);
  }

  async listByCompany(
    companyId: string,
    input: CursorPaginationInput & MembershipListFilter = {},
  ): Promise<CursorPage<Membership>> {
    const limit = clampLimit(input.limit);
    const sortSpec = resolveMembershipSort(input.sort);
    const decoded = decodeCursor(input.cursor);
    const where = combineWithCursor({ companyId }, sortSpec, decoded);
    const orderBy = buildCursorOrderBy(sortSpec);
    const client = resolveClient(this.prisma);
    const rows = await client.membership.findMany({ where, orderBy, take: limit + 1 });
    const items = rows.map(toDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: cursorValueOf(sortSpec, item as unknown as Record<string, unknown>),
      id: item.id,
    }));
  }

  async create(
    input: Omit<Membership, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<Membership> {
    const row = await resolveClient(this.prisma).membership.create({
      data: {
        id: input.id,
        userId: input.userId,
        companyId: input.companyId,
        role: input.role,
        status: input.status,
      },
    });
    return toDomain(row);
  }

  async updateStatus(
    id: string,
    expectedVersion: number,
    status: Membership['status'],
  ): Promise<Membership> {
    const client = resolveClient(this.prisma);
    const { count } = await client.membership.updateMany({
      where: { id, version: expectedVersion },
      data: { status, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Membership ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await client.membership.findUnique({ where: { id } });
    if (!updated) {
      throw new ResourceNotFoundError(`Membership ${id} not found after update.`, { id });
    }
    return toDomain(updated);
  }
}

/** DB-005: explicit allowlist, never a raw sort field passed straight into Prisma's `orderBy`. */
function resolveMembershipSort(sort: MembershipListFilter['sort']): SortSpec {
  switch (sort) {
    case 'createdAt_desc':
      return { field: 'createdAt', direction: 'desc', kind: 'date' };
    case 'createdAt_asc':
    default:
      return { field: 'createdAt', direction: 'asc', kind: 'date' };
  }
}

function toDomain(row: MembershipRow): Membership {
  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
