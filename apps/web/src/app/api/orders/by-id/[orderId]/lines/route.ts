import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { problemResponse } from '@/server/problem-response';
import { requireActor } from '@/server/session';
import { addOrderLine } from '@eramix/application';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

const addLineSchema = z.object({
  expectedVersion: z.number().int().min(0),
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  try {
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
      },
    );

    return NextResponse.json(orderToDto(order));
  } catch (error) {
    return problemResponse(error);
  }
}
