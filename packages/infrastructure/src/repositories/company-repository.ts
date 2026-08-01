import type { CompanyRepository } from '@eramix/application';
import type { Company } from '@eramix/domain';
import type { Company as CompanyRow } from '../generated/prisma/client.js';
import { nullableJsonToRecord } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
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
