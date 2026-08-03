import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { listPlatformSettingsHistory, requirePermission } from '@eramix/application';
import { NextResponse } from 'next/server';

const getHandler = withApiHandler('admin.settings.history.list', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'settings.manage');

  const url = new URL(request.url);
  const cursorParam = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  const container = getContainer();
  const { data, page } = await listPlatformSettingsHistory(
    { historyRepo: container.settingsHistoryRepo },
    {
      ...(cursorParam !== null ? { cursor: cursorParam } : {}),
      ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
    },
  );

  return NextResponse.json({
    data: data.map((entry) => ({
      id: entry.id,
      previousVersion: entry.previousVersion,
      changeReason: entry.changeReason ?? null,
      changedByUserId: entry.changedByUserId ?? null,
      createdAt: entry.createdAt.toISOString(),
      previousCanonicalHost: entry.previousSnapshot.canonicalHost,
    })),
    page,
  });
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
