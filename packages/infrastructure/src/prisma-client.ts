import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export type { PrismaClient } from './generated/prisma/client.js';

/**
 * Prisma 7 requires an explicit driver adapter (no implicit connection from
 * schema.prisma's datasource.url anymore) — see prisma.config.ts for the CLI
 * side of the same connection string.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
