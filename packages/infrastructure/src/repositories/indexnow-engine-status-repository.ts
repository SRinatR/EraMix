import type { IndexNowEngineStatus, IndexNowEngineStatusRepository } from '@eramix/application';
import type { IndexNowEngineStatus as IndexNowEngineStatusRow } from '../generated/prisma/client.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaIndexNowEngineStatusRepository implements IndexNowEngineStatusRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordResult(status: IndexNowEngineStatus): Promise<void> {
    await resolveClient(this.prisma).indexNowEngineStatus.upsert({
      where: { engine: status.engine },
      create: {
        engine: status.engine,
        lastAttemptAt: status.lastAttemptAt,
        lastSucceeded: status.lastSucceeded,
        lastStatusCode: status.lastStatusCode ?? null,
        lastError: status.lastError ?? null,
        lastUrlCount: status.lastUrlCount,
      },
      update: {
        lastAttemptAt: status.lastAttemptAt,
        lastSucceeded: status.lastSucceeded,
        lastStatusCode: status.lastStatusCode ?? null,
        lastError: status.lastError ?? null,
        lastUrlCount: status.lastUrlCount,
      },
    });
  }

  async listAll(): Promise<readonly IndexNowEngineStatus[]> {
    const rows = await resolveClient(this.prisma).indexNowEngineStatus.findMany({
      orderBy: { engine: 'asc' },
    });
    return rows.map(toDomain);
  }
}

function toDomain(row: IndexNowEngineStatusRow): IndexNowEngineStatus {
  return {
    engine: row.engine,
    lastAttemptAt: row.lastAttemptAt,
    lastSucceeded: row.lastSucceeded,
    lastStatusCode: nullToUndefined(row.lastStatusCode),
    lastError: nullToUndefined(row.lastError),
    lastUrlCount: row.lastUrlCount,
  };
}
