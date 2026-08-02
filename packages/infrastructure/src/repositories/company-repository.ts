import type { CompanyRepository } from '@eramix/application';
import { ResourceNotFoundError, type Company } from '@eramix/domain';
import type { Company as CompanyRow } from '../generated/prisma/client.js';
import { nullableJsonToRecord } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { assertOptimisticLockAcquired } from '../prisma-error-mapping.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaCompanyRepository implements CompanyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Company | undefined> {
    const row = await resolveClient(this.prisma).company.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async create(input: Omit<Company, 'version' | 'createdAt' | 'updatedAt'>): Promise<Company> {
    const row = await resolveClient(this.prisma).company.create({
      data: {
        id: input.id,
        legalName: input.legalName,
        status: input.status,
        ...(input.metadata !== undefined ? { metadata: input.metadata as object } : {}),
      },
    });
    return toDomain(row);
  }

  async listAll(): Promise<readonly Company[]> {
    const rows = await resolveClient(this.prisma).company.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async updateStatus(
    id: string,
    expectedVersion: number,
    status: Company['status'],
  ): Promise<Company> {
    const client = resolveClient(this.prisma);
    const { count } = await client.company.updateMany({
      where: { id, version: expectedVersion },
      data: { status, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Company ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await client.company.findUnique({ where: { id } });
    if (!updated) {
      throw new ResourceNotFoundError(`Company ${id} not found after update.`, { id });
    }
    return toDomain(updated);
  }
}

function toDomain(row: CompanyRow): Company {
  return {
    id: row.id,
    legalName: row.legalName,
    status: row.status,
    metadata: nullableJsonToRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
