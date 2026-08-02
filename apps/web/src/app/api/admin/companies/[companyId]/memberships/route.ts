import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { ResourceNotFoundError } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createMembershipSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['OWNER', 'MEMBER']),
});

export const GET = withApiHandler<{ companyId: string }>(
  'admin.companies.memberships.list',
  async (request, _traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'users.manage');

    const { companyId } = await params;
    const container = getContainer();
    const memberships = await container.memberships.listByCompany(companyId);

    return NextResponse.json({ items: memberships });
  },
);

export const POST = withApiHandler<{ companyId: string }>(
  'admin.companies.memberships.create',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'users.manage');

    const { companyId } = await params;
    const body = createMembershipSchema.parse(await request.json());
    const container = getContainer();

    const company = await container.companies.findById(companyId);
    if (!company) {
      throw new ResourceNotFoundError(`Company ${companyId} not found.`, { companyId });
    }
    const user = await container.users.findById(body.userId);
    if (!user) {
      throw new ResourceNotFoundError(`User ${body.userId} not found.`, { userId: body.userId });
    }

    const membership = await container.memberships.create({
      id: container.idGen.nextId(),
      userId: body.userId,
      companyId,
      role: body.role,
      status: 'ACTIVE',
    });

    await container.auditEvents.record({
      actorUserId: actor.userId,
      action: 'membership.created',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { companyId, userId: body.userId, role: body.role },
      traceId,
    });

    return NextResponse.json(membership, { status: 201 });
  },
);
