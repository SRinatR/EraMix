import type { AnalyticsSinkStatus, AnalyticsSinkStatusRepository } from '@eramix/application';
import type { AnalyticsSinkStatus as AnalyticsSinkStatusRow } from '../generated/prisma/client.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaAnalyticsSinkStatusRepository implements AnalyticsSinkStatusRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordResult(status: AnalyticsSinkStatus): Promise<void> {
    await resolveClient(this.prisma).analyticsSinkStatus.upsert({
      where: { sink: status.sink },
      create: {
        sink: status.sink,
        lastAttemptAt: status.lastAttemptAt,
        lastSucceeded: status.lastSucceeded,
        lastSkipped: status.lastSkipped,
        lastError: status.lastError ?? null,
      },
      update: {
        lastAttemptAt: status.lastAttemptAt,
        lastSucceeded: status.lastSucceeded,
        lastSkipped: status.lastSkipped,
        lastError: status.lastError ?? null,
      },
    });
  }

  async listAll(): Promise<readonly AnalyticsSinkStatus[]> {
    const rows = await resolveClient(this.prisma).analyticsSinkStatus.findMany({
      orderBy: { sink: 'asc' },
    });
    return rows.map(toDomain);
  }
}

function toDomain(row: AnalyticsSinkStatusRow): AnalyticsSinkStatus {
  return {
    sink: row.sink,
    lastAttemptAt: row.lastAttemptAt,
    lastSucceeded: row.lastSucceeded,
    lastSkipped: row.lastSkipped,
    lastError: nullToUndefined(row.lastError),
  };
}
