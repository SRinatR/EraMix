import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { submitOrder } from '@eramix/application';
import { ValidationFailedError } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const submitOrderSchema = z.object({
  expectedVersion: z.number().int().min(0),
});

const postHandler = withApiHandler<{ orderId: string }>(
  'orders.submit',
  async (request, traceId, { params }) => {
    enforceRateLimit('orderSubmit', request);

    const actor = await requireActor(request);
    const { orderId } = await params;
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!idempotencyKey) {
      throw new ValidationFailedError(
        'The Idempotency-Key header is required to submit an order.',
        {},
      );
    }
    const body = submitOrderSchema.parse(await request.json());
    const container = getContainer();

    const order = await submitOrder(
      {
        orderRepo: container.orders,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
        clock: container.clock,
      },
      {
        orderId,
        expectedVersion: body.expectedVersion,
        idempotencyKey,
        actorUserId: actor.userId,
        actorCompanyIds: actor.companyIds,
        traceId,
      },
    );

    return NextResponse.json(orderToDto(order));
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{ orderId: string }>({
  POST: postHandler,
});
