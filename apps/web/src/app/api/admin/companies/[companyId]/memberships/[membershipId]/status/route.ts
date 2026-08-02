import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INVITED', 'REVOKED']),
  expectedVersion: z.number().int().min(0),
});

export const PATCH = withApiHandler<{ companyId: string; membershipId: string }>(
  'admin.companies.memberships.updateStatus',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'users.manage');

    const { membershipId } = await params;
    const body = updateStatusSchema.parse(await request.json());
    const container = getContainer();

    const before = await container.memberships.findById(membershipId);
    const updated = await container.memberships.updateStatus(
      membershipId,
      body.expectedVersion,
      body.status,
    );
    await container.auditEvents.record({
      actorUserId: actor.userId,
      action: 'membership.status_changed',
      entityType: 'Membership',
      entityId: membershipId,
      metadata: { previousStatus: before?.status, newStatus: body.status },
      traceId,
    });

    return NextResponse.json(updated);
  },
);
