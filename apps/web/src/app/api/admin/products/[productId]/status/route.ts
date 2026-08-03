import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { transitionProductStatus } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const transitionSchema = z.object({
  toStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  expectedVersion: z.number().int().min(0),
});

const patchHandler = withApiHandler<{ productId: string }>(
  'admin.products.transitionStatus',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { productId } = await params;
    const body = transitionSchema.parse(await request.json());
    const container = getContainer();

    const updated = await transitionProductStatus(
      {
        productRepo: container.products,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        id: productId,
        expectedVersion: body.expectedVersion,
        toStatus: body.toStatus,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      version: updated.version,
    });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  productId: string;
}>({
  PATCH: patchHandler,
});
