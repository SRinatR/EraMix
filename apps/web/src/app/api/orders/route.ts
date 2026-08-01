import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { withApiHandler } from '@/server/handler';
import { requireActor } from '@/server/session';
import { createDraftOrder, hasPermission, type OrderWithLines } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createOrderSchema = z.object({
  companyId: z.string().min(1),
  contactName: z.string().min(1).optional(),
  contactPhone: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export const GET = withApiHandler('orders.list', async (request) => {
  const actor = await requireActor(request);
  const container = getContainer();

  let orders: readonly OrderWithLines[];
  if (hasPermission(actor.platformRole, 'order.read.all')) {
    orders = await container.orders.listAll();
  } else {
    const perCompany = await Promise.all(
      actor.companyIds.map((companyId) => container.orders.listByCompany(companyId)),
    );
    orders = perCompany.flat();
  }

  return NextResponse.json({ items: orders.map(orderToDto) });
});

export const POST = withApiHandler('orders.create', async (request, traceId) => {
  const actor = await requireActor(request);
  const body = createOrderSchema.parse(await request.json());
  const container = getContainer();

  const order = await createDraftOrder(
    {
      orderRepo: container.orders,
      productRepo: container.products,
      auditRepo: container.auditEvents,
      outboxRepo: container.outbox,
      uow: container.uow,
      idGen: container.idGen,
    },
    {
      companyId: body.companyId,
      createdByUserId: actor.userId,
      actorCompanyIds: actor.companyIds,
      ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
      ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
      lines: body.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        ...(line.note !== undefined ? { note: line.note } : {}),
      })),
      traceId,
    },
  );

  return NextResponse.json(orderToDto(order), { status: 201 });
});
