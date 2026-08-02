import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  type CompanyListFilter,
  type CompanyRepository,
  type CursorPage,
  type CursorPaginationInput,
} from '@eramix/application';
import { ResourceNotFoundError, type Company } from '@eramix/domain';
import type { Company as CompanyRow } from '../generated/prisma/client.js';
import { nullableJsonToRecord } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import {
  buildCursorOrderBy,
  combineWithCursor,
  cursorValueOf,
  type SortSpec,
} from './cursor-query.js';
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
    input: CursorPaginationInput & CompanyListFilter = {},
  ): Promise<CursorPage<Company>> {
    const limit = clampLimit(input.limit);
    const sortSpec = resolveCompanySort(input.sort);
    const decoded = decodeCursor(input.cursor);
    const filterWhere: Record<string, unknown> =
      input.search !== undefined && input.search.trim().length > 0
        ? { legalName: { contains: input.search, mode: 'insensitive' as const } }
        : {};
    const where = combineWithCursor(filterWhere, sortSpec, decoded);
    const orderBy = buildCursorOrderBy(sortSpec);
    const client = resolveClient(this.prisma);
    const rows = await client.company.findMany({ where, orderBy, take: limit + 1 });
    const items = rows.map(toDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: cursorValueOf(sortSpec, item as unknown as Record<string, unknown>),
      id: item.id,
    }));
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
function resolveCompanySort(sort: CompanyListFilter['sort']): SortSpec {
  switch (sort) {
    case 'legalName_asc':
      return { field: 'legalName', direction: 'asc', kind: 'string' };
    case 'legalName_desc':
      return { field: 'legalName', direction: 'desc', kind: 'string' };
    case 'createdAt_desc':
      return { field: 'createdAt', direction: 'desc', kind: 'date' };
    case 'createdAt_asc':
    default:
      return { field: 'createdAt', direction: 'asc', kind: 'date' };
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
