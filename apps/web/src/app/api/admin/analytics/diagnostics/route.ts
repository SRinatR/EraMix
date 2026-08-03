import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { getAnalyticsDiagnostics } from '@eramix/application';
import { NextResponse } from 'next/server';

const getHandler = withApiHandler('admin.analytics.diagnostics', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const container = getContainer();

  const diagnostics = await getAnalyticsDiagnostics(
    { settingsRepo: container.settingsRepo, sinkStatusRepo: container.analyticsSinkStatus },
    actor.platformRole,
  );
  return NextResponse.json({ data: diagnostics });
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
