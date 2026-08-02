import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { withApiHandler } from '@/server/handler';
import { requireActor } from '@/server/session';
import { createDraftOrder, listOrdersForActor, type OrderListFilter } from '@eramix/application';
import { NextResponse } from 'next/server';
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

/** ACC-003 ("фильтр по статусу/дате, сортировку, пагинацию"). */
function parseOrderListQuery(url: URL): {
  limit?: number;
  offset?: number;
} & OrderListFilter {
  const statusParam = url.searchParams.get('status');
  const status =
    statusParam && (ORDER_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as (typeof ORDER_STATUSES)[number])
      : undefined;
  const createdFromParam = url.searchParams.get('createdFrom');
  const createdToParam = url.searchParams.get('createdTo');
  const sortParam = url.searchParams.get('sort');
  const searchParam = url.searchParams.get('search');
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  return {
    ...(status !== undefined ? { status } : {}),
    ...(createdFromParam !== null ? { createdFrom: new Date(createdFromParam) } : {}),
    ...(createdToParam !== null ? { createdTo: new Date(createdToParam) } : {}),
    ...(sortParam === 'createdAt_asc' || sortParam === 'createdAt_desc' ? { sort: sortParam } : {}),
    ...(searchParam !== null ? { search: searchParam } : {}),
    ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
    ...(offsetParam !== null ? { offset: Number(offsetParam) } : {}),
  };
}

export const GET = withApiHandler('orders.list', async (request) => {
  const actor = await requireActor(request);
  const container = getContainer();
  const url = new URL(request.url);
  const query = parseOrderListQuery(url);
  const companyIdParam = url.searchParams.get('companyId');

  const { items, total, limit, offset } = await listOrdersForActor(container.orders, {
    ...query,
    actorRole: actor.platformRole,
    actorCompanyIds: actor.companyIds,
    ...(companyIdParam !== null ? { companyId: companyIdParam } : {}),
  });
  return NextResponse.json({ items: items.map(orderToDto), total, limit, offset });
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
