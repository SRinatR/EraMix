import type { MembershipRepository } from '@eramix/application';
import type { Membership } from '@eramix/domain';
import type { Membership as MembershipRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
