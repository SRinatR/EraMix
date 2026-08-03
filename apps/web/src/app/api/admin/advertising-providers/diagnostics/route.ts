import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { getAdvertisingDiagnostics } from '@eramix/application';
import { NextResponse } from 'next/server';

const getHandler = withApiHandler('admin.advertising.diagnostics', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const container = getContainer();

  const diagnostics = await getAdvertisingDiagnostics(
    { repo: container.advertisingProviders },
    actor.platformRole,
  );
  return NextResponse.json(diagnostics);
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
