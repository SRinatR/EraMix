import { clampPagination, type MembershipRepository, type Page } from '@eramix/application';
import { ResourceNotFoundError, type Membership } from '@eramix/domain';
import type { Membership as MembershipRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
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
    input: { limit?: number; offset?: number } = {},
  ): Promise<Page<Membership>> {
    const { limit, offset } = clampPagination(input);
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.membership.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      client.membership.count({ where: { companyId } }),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
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
