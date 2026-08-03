import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { retireContent } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const retireSchema = z.object({
  reason: z.string().min(1),
  expectedVersion: z.number().int().min(0),
});

const patchHandler = withApiHandler<{ contentId: string }>(
  'admin.content.retire',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { contentId } = await params;
    const body = retireSchema.parse(await request.json());
    const container = getContainer();

    const updated = await retireContent(
      {
        contentRepo: container.content,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        id: contentId,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      retiredAt: updated.retiredAt,
      retirementReason: updated.retirementReason,
      version: updated.version,
    });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  contentId: string;
}>({
  PATCH: patchHandler,
});
