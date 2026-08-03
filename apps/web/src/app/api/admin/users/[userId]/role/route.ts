import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateRoleSchema = z.object({
  platformRole: z.enum(['CUSTOMER', 'MANAGER', 'CONTENT_EDITOR', 'ADMIN', 'AUDITOR']),
  expectedVersion: z.number().int().min(0),
});

const patchHandler = withApiHandler<{ userId: string }>(
  'admin.users.updateRole',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'users.manage');

    const { userId } = await params;
    const body = updateRoleSchema.parse(await request.json());
    const container = getContainer();

    const before = await container.users.findById(userId);
    const updated = await container.users.updatePlatformRole(
      userId,
      body.expectedVersion,
      body.platformRole,
    );
    await container.auditEvents.record({
      actorUserId: actor.userId,
      action: 'user.platform_role_changed',
      entityType: 'User',
      entityId: userId,
      metadata: { previousRole: before?.platformRole, newRole: body.platformRole },
      traceId,
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      platformRole: updated.platformRole,
      status: updated.status,
      version: updated.version,
    });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{ userId: string }>({
  PATCH: patchHandler,
});
