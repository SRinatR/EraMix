import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { retireProduct } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const retireSchema = z.object({
  reason: z.string().min(1),
  expectedVersion: z.number().int().min(0),
});

export const PATCH = withApiHandler<{ productId: string }>(
  'admin.products.retire',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { productId } = await params;
    const body = retireSchema.parse(await request.json());
    const container = getContainer();

    const updated = await retireProduct(
      {
        productRepo: container.products,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        id: productId,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      retiredAt: updated.retiredAt,
      retirementReason: updated.retirementReason,
      version: updated.version,
    });
  },
);
