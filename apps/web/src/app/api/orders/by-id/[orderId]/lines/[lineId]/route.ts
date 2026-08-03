import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { requireActor } from '@/server/session';
import { removeOrderLine } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const removeLineSchema = z.object({
  expectedVersion: z.number().int().min(0),
});

/**
 * The customer-facing "edit a draft order" UI needs both add and remove —
 * addOrderLine already had a route (lines/route.ts); removeOrderLine
 * (packages/application/src/order-lifecycle.ts) existed since Phase 5 but
 * had no route handler until now.
 */
const deleteHandler = withApiHandler<{ orderId: string; lineId: string }>(
  'orders.lines.remove',
  async (request, traceId, { params }) => {
    const actor = await requireActor(request);
    const { orderId, lineId } = await params;
    const body = removeLineSchema.parse(await request.json());
    const container = getContainer();

    const order = await removeOrderLine(
      {
        orderRepo: container.orders,
        auditRepo: container.auditEvents,
      },
      {
        orderId,
        expectedVersion: body.expectedVersion,
        lineId,
        actorUserId: actor.userId,
        actorCompanyIds: actor.companyIds,
        traceId,
      },
    );

    return NextResponse.json(orderToDto(order));
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  orderId: string;
  lineId: string;
}>({
  DELETE: deleteHandler,
});
