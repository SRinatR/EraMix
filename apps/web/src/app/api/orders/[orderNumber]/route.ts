import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { withApiHandler } from '@/server/handler';
import { requireActor } from '@/server/session';
import { assertOrderCompanyAccess } from '@eramix/application';
import { ResourceNotFoundError } from '@eramix/domain';
import { NextResponse } from 'next/server';

export const GET = withApiHandler<{ orderNumber: string }>(
  'orders.getByNumber',
  async (request, _traceId, { params }) => {
    const actor = await requireActor(request);
    const { orderNumber } = await params;
    const container = getContainer();

    const order = await container.orders.findByOrderNumber(orderNumber);
    if (!order) {
      throw new ResourceNotFoundError(`Order "${orderNumber}" not found.`, { orderNumber });
    }
    assertOrderCompanyAccess(actor.platformRole, actor.companyIds, order.companyId);

    return NextResponse.json(orderToDto(order));
  },
);
