import {
  clampPagination,
  type CompanyListFilter,
  type CompanyRepository,
  type Page,
} from '@eramix/application';
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

  async listAll(
    input: { limit?: number; offset?: number } & CompanyListFilter = {},
  ): Promise<Page<Company>> {
    const { limit, offset } = clampPagination(input);
    const where =
      input.search !== undefined && input.search.trim().length > 0
        ? { legalName: { contains: input.search, mode: 'insensitive' as const } }
        : {};
    const orderBy = buildCompanyOrderBy(input.sort);
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.company.findMany({ where, orderBy, take: limit, skip: offset }),
      client.company.count({ where }),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
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

/** DB-005: explicit allowlist, never a raw sort field passed straight into Prisma's `orderBy`. */
function buildCompanyOrderBy(sort: CompanyListFilter['sort']): Record<string, 'asc' | 'desc'> {
  switch (sort) {
    case 'legalName_asc':
      return { legalName: 'asc' };
    case 'legalName_desc':
      return { legalName: 'desc' };
    case 'createdAt_desc':
      return { createdAt: 'desc' };
    case 'createdAt_asc':
    default:
      return { createdAt: 'asc' };
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
