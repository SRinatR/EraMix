import { getContainer } from '@/server/container';
import { problemResponse } from '@/server/problem-response';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

const updateRoleSchema = z.object({
  platformRole: z.enum(['CUSTOMER', 'MANAGER', 'CONTENT_EDITOR', 'ADMIN', 'AUDITOR']),
  expectedVersion: z.number().int().min(0),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  try {
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
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      platformRole: updated.platformRole,
      status: updated.status,
      version: updated.version,
    });
  } catch (error) {
    return problemResponse(error);
  }
}
