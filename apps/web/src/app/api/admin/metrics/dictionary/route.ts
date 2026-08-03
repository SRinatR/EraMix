import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { getMetricDictionary } from '@eramix/application';
import { NextResponse } from 'next/server';

const getHandler = withApiHandler('admin.metrics.dictionary', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const dictionary = getMetricDictionary(actor.platformRole);
  return NextResponse.json(dictionary);
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
