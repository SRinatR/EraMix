import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  expectedVersion: z.number().int().min(0),
});

const patchHandler = withApiHandler<{ companyId: string }>(
  'admin.companies.updateStatus',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'users.manage');

    const { companyId } = await params;
    const body = updateStatusSchema.parse(await request.json());
    const container = getContainer();

    const before = await container.companies.findById(companyId);
    const updated = await container.companies.updateStatus(
      companyId,
      body.expectedVersion,
      body.status,
    );
    await container.auditEvents.record({
      actorUserId: actor.userId,
      action: 'company.status_changed',
      entityType: 'Company',
      entityId: companyId,
      metadata: { previousStatus: before?.status, newStatus: body.status },
      traceId,
    });

    return NextResponse.json({
      id: updated.id,
      legalName: updated.legalName,
      status: updated.status,
      metadata: updated.metadata,
      version: updated.version,
    });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  companyId: string;
}>({
  PATCH: patchHandler,
});
