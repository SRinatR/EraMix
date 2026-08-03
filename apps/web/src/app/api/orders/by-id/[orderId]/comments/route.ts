import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { requireActor } from '@/server/session';
import { addOrderComment, listOrderCommentsForActor } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const addCommentSchema = z.object({
  body: z.string().min(1).max(2000),
  visibility: z.enum(['PUBLIC', 'INTERNAL']),
});

const getHandler = withApiHandler<{ orderId: string }>(
  'orders.comments.list',
  async (request, _traceId, { params }) => {
    const actor = await requireActor(request);
    const { orderId } = await params;
    const container = getContainer();

    const comments = await listOrderCommentsForActor(
      { orderRepo: container.orders, commentRepo: container.orderComments },
      { orderId, actorRole: actor.platformRole, actorCompanyIds: actor.companyIds },
    );

    return NextResponse.json({ items: comments });
  },
);

const postHandler = withApiHandler<{ orderId: string }>(
  'orders.comments.add',
  async (request, traceId, { params }) => {
    const actor = await requireActor(request);
    const { orderId } = await params;
    const body = addCommentSchema.parse(await request.json());
    const container = getContainer();

    const comment = await addOrderComment(
      {
        orderRepo: container.orders,
        commentRepo: container.orderComments,
        auditRepo: container.auditEvents,
        idGen: container.idGen,
      },
      {
        orderId,
        body: body.body,
        visibility: body.visibility,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        actorCompanyIds: actor.companyIds,
        traceId,
      },
    );

    return NextResponse.json(comment, { status: 201 });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{ orderId: string }>({
  GET: getHandler,
  POST: postHandler,
});
