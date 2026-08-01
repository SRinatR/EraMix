import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from './generated/prisma/client.js';
import type { PrismaClient } from './prisma-client.js';

const storage = new AsyncLocalStorage<Prisma.TransactionClient>();

/** Used by PrismaUnitOfWork.runInTransaction; not called directly by adapters. */
export function runWithTransactionClient<T>(
  client: Prisma.TransactionClient,
  work: () => Promise<T>,
): Promise<T> {
  return storage.run(client, work);
}

/**
 * Repository adapters call this instead of using their injected PrismaClient
 * directly, so a call made inside `UnitOfWork.runInTransaction` transparently
 * joins that transaction (e.g. the state change and its AuditEvent/
 * OutboxMessage rows commit or roll back together — CLAUDE.md's audit/outbox
 * atomicity requirement) while a call made outside one still works against
 * the plain client.
 */
export function resolveClient(defaultClient: PrismaClient): Prisma.TransactionClient {
  return storage.getStore() ?? defaultClient;
}
