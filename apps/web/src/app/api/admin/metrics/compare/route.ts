import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { compareMetricSources } from '@eramix/application';
import { METRIC_IDS, METRIC_SOURCES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const measurementSchema = z.object({
  source: z.enum(METRIC_SOURCES),
  metricId: z.enum(METRIC_IDS),
  value: z.number(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  attributionWindowDaysUsed: z.number().int().positive().optional(),
  currency: z.string().min(1).optional(),
});

const compareRequestSchema = z.object({
  metricId: z.enum(METRIC_IDS),
  measurements: z.array(measurementSchema).min(1),
});

/**
 * The governed comparison layer's stateless normalization endpoint
 * (CLAUDE.md: "Dashboards show source-native and normalized comparisons
 * beside discrepancies; never silently merge incompatible counts"). The
 * caller supplies source-native measurements it already holds — this route
 * never fetches or invents data from any provider itself.
 */
const postHandler = withApiHandler('admin.metrics.compare', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const body = compareRequestSchema.parse(await request.json());

  const result = compareMetricSources(actor.platformRole, body.metricId, body.measurements);
  return NextResponse.json(result);
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  POST: postHandler,
});
