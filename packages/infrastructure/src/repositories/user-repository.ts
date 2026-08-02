import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  type CursorPage,
  type CursorPaginationInput,
  type UserListFilter,
  type UserRepository,
} from '@eramix/application';
import { ResourceNotFoundError, type PlatformRole, type User } from '@eramix/domain';
import type { User as UserRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import {
  buildCursorOrderBy,
  combineWithCursor,
  cursorValueOf,
  type SortSpec,
} from './cursor-query.js';
import { assertOptimisticLockAcquired } from '../prisma-error-mapping.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | undefined> {
    const row = await resolveClient(this.prisma).user.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findByIssuerAndSubject(issuer: string, subject: string): Promise<User | undefined> {
    const row = await resolveClient(this.prisma).user.findUnique({
      where: { issuer_subject: { issuer, subject } },
    });
    return row ? toDomain(row) : undefined;
  }

  async create(input: Omit<User, 'version' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const row = await resolveClient(this.prisma).user.create({
      data: {
        id: input.id,
        issuer: input.issuer,
        subject: input.subject,
        email: input.email,
        displayName: input.displayName,
        status: input.status,
        platformRole: input.platformRole,
      },
    });
    return toDomain(row);
  }

  async listAll(input: CursorPaginationInput & UserListFilter = {}): Promise<CursorPage<User>> {
    const limit = clampLimit(input.limit);
    const sortSpec = resolveUserSort(input.sort);
    const decoded = decodeCursor(input.cursor);
    const filterWhere: Record<string, unknown> =
      input.search !== undefined && input.search.trim().length > 0
        ? {
            OR: [
              { email: { contains: input.search, mode: 'insensitive' as const } },
              { displayName: { contains: input.search, mode: 'insensitive' as const } },
            ],
          }
        : {};
    const where = combineWithCursor(filterWhere, sortSpec, decoded);
    const orderBy = buildCursorOrderBy(sortSpec);
    const client = resolveClient(this.prisma);
    const rows = await client.user.findMany({ where, orderBy, take: limit + 1 });
    const items = rows.map(toDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: cursorValueOf(sortSpec, item as unknown as Record<string, unknown>),
      id: item.id,
    }));
  }

  async updatePlatformRole(
    id: string,
    expectedVersion: number,
    platformRole: PlatformRole,
  ): Promise<User> {
    const client = resolveClient(this.prisma);
    const { count } = await client.user.updateMany({
      where: { id, version: expectedVersion },
      data: { platformRole, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `User ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await resolveClient(this.prisma).user.findUnique({ where: { id } });
    if (!updated) {
      throw new ResourceNotFoundError(`User ${id} not found after update.`, { id });
    }
    return toDomain(updated);
  }
}

/** DB-005: explicit allowlist, never a raw sort field passed straight into Prisma's `orderBy`. */
function resolveUserSort(sort: UserListFilter['sort']): SortSpec {
  switch (sort) {
    case 'displayName_asc':
      return { field: 'displayName', direction: 'asc', kind: 'string' };
    case 'displayName_desc':
      return { field: 'displayName', direction: 'desc', kind: 'string' };
    case 'createdAt_desc':
      return { field: 'createdAt', direction: 'desc', kind: 'date' };
    case 'createdAt_asc':
    default:
      return { field: 'createdAt', direction: 'asc', kind: 'date' };
  }
}

function toDomain(row: UserRow): User {
  return {
    id: row.id,
    issuer: row.issuer,
    subject: row.subject,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    platformRole: row.platformRole,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
