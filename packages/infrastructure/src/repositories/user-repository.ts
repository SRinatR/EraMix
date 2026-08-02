import { clampPagination, type Page, type UserRepository } from '@eramix/application';
import { ResourceNotFoundError, type PlatformRole, type User } from '@eramix/domain';
import type { User as UserRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
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

  async listAll(
    input: { limit?: number; offset?: number; search?: string } = {},
  ): Promise<Page<User>> {
    const { limit, offset } = clampPagination(input);
    const where =
      input.search !== undefined && input.search.trim().length > 0
        ? {
            OR: [
              { email: { contains: input.search, mode: 'insensitive' as const } },
              { displayName: { contains: input.search, mode: 'insensitive' as const } },
            ],
          }
        : {};
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.user.findMany({ where, orderBy: { createdAt: 'asc' }, take: limit, skip: offset }),
      client.user.count({ where }),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
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
