import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { withApiHandler } from '@/server/handler';
import { requireActor } from '@/server/session';
import { addOrderLine } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const addLineSchema = z.object({
  expectedVersion: z.number().int().min(0),
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

export const POST = withApiHandler<{ orderId: string }>(
  'orders.lines.add',
  async (request, traceId, { params }) => {
    const actor = await requireActor(request);
    const { orderId } = await params;
    const body = addLineSchema.parse(await request.json());
    const container = getContainer();

    const order = await addOrderLine(
      {
        orderRepo: container.orders,
        productRepo: container.products,
        auditRepo: container.auditEvents,
      },
      {
        orderId,
        expectedVersion: body.expectedVersion,
        line: {
          productId: body.productId,
          quantity: body.quantity,
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
        actorUserId: actor.userId,
        actorCompanyIds: actor.companyIds,
        traceId,
      },
    );

    return NextResponse.json(orderToDto(order));
  },
);
