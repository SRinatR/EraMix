import type { UnitOfWork } from '@eramix/application';
import type { PrismaClient } from './prisma-client.js';
import { runWithTransactionClient } from './transaction-context.js';

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => runWithTransactionClient(tx, work));
  }
}
