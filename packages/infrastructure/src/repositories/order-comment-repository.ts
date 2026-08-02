import type { OrderCommentRepository } from '@eramix/application';
import type { OrderComment } from '@eramix/domain';
import type { OrderComment as OrderCommentRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaOrderCommentRepository implements OrderCommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByOrder(orderId: string): Promise<readonly OrderComment[]> {
    const rows = await resolveClient(this.prisma).orderComment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async create(comment: Omit<OrderComment, 'createdAt'>): Promise<OrderComment> {
    const row = await resolveClient(this.prisma).orderComment.create({
      data: {
        id: comment.id,
        orderId: comment.orderId,
        authorId: comment.authorId,
        visibility: comment.visibility,
        body: comment.body,
      },
    });
    return toDomain(row);
  }
}

function toDomain(row: OrderCommentRow): OrderComment {
  return {
    id: row.id,
    orderId: row.orderId,
    authorId: row.authorId,
    visibility: row.visibility,
    body: row.body,
    createdAt: row.createdAt,
  };
}
