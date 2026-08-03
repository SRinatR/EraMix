import type { IdGenerator } from '@eramix/application';
import type { PrismaClient } from './prisma-client.js';
import { resolveClient } from './transaction-context.js';

/**
 * ADR-0021: PostgreSQL 19 Beta 2's native `uuidv7()` SQL function is the
 * authoritative generation mechanism for every internal entity id an
 * application use case must know before insert (e.g. to embed it in the
 * same transaction's AuditEvent/OutboxMessage payload, or as the FK linking
 * a not-yet-persisted parent to its nested translation rows) — never a
 * hand-rolled/unverified JavaScript UUIDv7 implementation for this path.
 * `resolveClient` joins the caller's ambient transaction
 * (transaction-context.ts) when one is active, so the id is obtained from
 * the same connection/transaction boundary as the row it will be used to
 * insert, exactly like every other repository adapter in this package.
 */
export class PostgresUuidV7IdGenerator implements IdGenerator {
  constructor(private readonly prisma: PrismaClient) {}

  async nextId(): Promise<string> {
    const client = resolveClient(this.prisma);
    const rows = await client.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
    const row = rows[0];
    if (!row) {
      throw new Error('PostgreSQL uuidv7() query returned no row.');
    }
    return row.id;
  }
}
