import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { problemResponse } from '@/server/problem-response';
import { requireActor } from '@/server/session';
import { transitionOrderStatus } from '@eramix/application';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

const ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'WAITING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY_FOR_PICKUP',
  'READY_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
] as const;

const transitionSchema = z.object({
  expectedVersion: z.number().int().min(0),
  toStatus: z.enum(ORDER_STATUSES),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireActor(request);
    const { orderId } = await params;
    const body = transitionSchema.parse(await request.json());
    const container = getContainer();

    const order = await transitionOrderStatus(
      {
        orderRepo: container.orders,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        orderId,
        expectedVersion: body.expectedVersion,
        toStatus: body.toStatus,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        actorCompanyIds: actor.companyIds,
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      },
    );

    return NextResponse.json(orderToDto(order));
  } catch (error) {
    return problemResponse(error);
  }
}
