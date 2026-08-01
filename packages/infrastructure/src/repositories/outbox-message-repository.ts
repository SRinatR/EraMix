import type { OutboxMessageRepository } from '@eramix/application';
import type { OutboxMessage } from '@eramix/domain';
import type { OutboxMessage as OutboxMessageRow } from '../generated/prisma/client.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaOutboxMessageRepository implements OutboxMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(
    message: Omit<OutboxMessage, 'id' | 'status' | 'attempts' | 'availableAt' | 'lastError'>,
  ): Promise<OutboxMessage> {
    const row = await resolveClient(this.prisma).outboxMessage.create({
      data: {
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        eventType: message.eventType,
        payload: message.payload as object,
      },
    });
    return toDomain(row);
  }

  /**
   * `FAILED` is included alongside `PENDING`: a message that failed once is
   * still retryable (that's the whole point of markFailed's backoff
   * `availableAt`) — only `SENT`/`DEAD_LETTER` are excluded from ever being
   * claimed again.
   */
  async claimPending(limit: number): Promise<readonly OutboxMessage[]> {
    const rows = await resolveClient(this.prisma).outboxMessage.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: new Date() } },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async markSent(id: string): Promise<void> {
    await resolveClient(this.prisma).outboxMessage.update({
      where: { id },
      data: { status: 'SENT' },
    });
  }

  async markFailed(id: string, error: string, nextAvailableAt: Date): Promise<void> {
    await resolveClient(this.prisma).outboxMessage.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: error,
        availableAt: nextAvailableAt,
        attempts: { increment: 1 },
      },
    });
  }

  async markDeadLetter(id: string, error: string): Promise<void> {
    await resolveClient(this.prisma).outboxMessage.update({
      where: { id },
      data: {
        status: 'DEAD_LETTER',
        lastError: error,
        attempts: { increment: 1 },
      },
    });
  }
}

function toDomain(row: OutboxMessageRow): OutboxMessage {
  return {
    id: row.id,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    payload: row.payload as Record<string, unknown>,
    status: row.status,
    attempts: row.attempts,
    availableAt: row.availableAt,
    lastError: nullToUndefined(row.lastError),
  };
}
