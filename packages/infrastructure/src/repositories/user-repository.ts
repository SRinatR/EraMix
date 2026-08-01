import type { UserRepository } from '@eramix/application';
import type { User } from '@eramix/domain';
import type { User as UserRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
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
      },
    });
    return toDomain(row);
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
