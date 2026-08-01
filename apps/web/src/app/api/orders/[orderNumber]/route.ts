import { getContainer } from '@/server/container';
import { orderToDto } from '@/server/dto';
import { problemResponse } from '@/server/problem-response';
import { requireActor } from '@/server/session';
import { assertOrderCompanyAccess } from '@eramix/application';
import { ResourceNotFoundError } from '@eramix/domain';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireActor(request);
    const { orderNumber } = await params;
    const container = getContainer();

    const order = await container.orders.findByOrderNumber(orderNumber);
    if (!order) {
      throw new ResourceNotFoundError(`Order "${orderNumber}" not found.`, { orderNumber });
    }
    assertOrderCompanyAccess(actor.platformRole, actor.companyIds, order.companyId);

    return NextResponse.json(orderToDto(order));
  } catch (error) {
    return problemResponse(error);
  }
}
