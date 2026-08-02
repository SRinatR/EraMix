import { getContainer } from '@/server/container';
import { analyticsEventsRequestSchema } from '@/server/analytics-event-schema';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { recordAnalyticsEvents } from '@eramix/application';
import { NextResponse } from 'next/server';

/**
 * Public, unauthenticated (an anonymous visitor's browser calls this
 * directly — see openapi.yaml's `security: []`). CSRF's same-origin check
 * (withApiHandler) still applies: a cross-site page cannot make this call
 * succeed against a real visitor's browser context. Its own rate-limit
 * bucket plus the strict per-event schema (server/analytics-event-schema.ts)
 * are the primary defenses against abuse of a public, unauthenticated
 * endpoint (CLAUDE.md: "Apply rate limits to... search" — the same
 * "public, abuse-prone surface" reasoning applies here).
 */
export const POST = withApiHandler('analytics.events.record', async (request) => {
  enforceRateLimit('analytics', request);
  const body = analyticsEventsRequestSchema.parse(await request.json());
  const container = getContainer();

  await recordAnalyticsEvents(
    { outboxRepo: container.outbox, clock: container.clock },
    body.events,
  );

  return new NextResponse(null, { status: 202 });
});
