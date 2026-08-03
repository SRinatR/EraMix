import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { rollbackPlatformSettings } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const rollbackSchema = z.object({
  expectedVersion: z.number().int().min(0),
});

const postHandler = withApiHandler<{ historyEntryId: string }>(
  'admin.settings.history.rollback',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { historyEntryId } = await params;
    const body = rollbackSchema.parse(await request.json());
    const container = getContainer();

    const updated = await rollbackPlatformSettings(
      {
        settingsRepo: container.settingsRepo,
        historyRepo: container.settingsHistoryRepo,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        historyEntryId,
        expectedVersion: body.expectedVersion,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({ canonicalHost: updated.canonicalHost, version: updated.version });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  historyEntryId: string;
}>({
  POST: postHandler,
});
