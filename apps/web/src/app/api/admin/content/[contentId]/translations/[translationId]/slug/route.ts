import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { changeContentSlug } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const changeSlugSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  namespace: z.enum(['ARTICLES', 'PAGES']),
  newSlug: z.string().min(1),
  reason: z.string().min(1).optional(),
});

/** Phase 6's named "explicit slug operation" — see the category route's sibling for full rationale. */
const patchHandler = withApiHandler<{ contentId: string; translationId: string }>(
  'admin.content.changeSlug',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { contentId, translationId } = await params;
    const body = changeSlugSchema.parse(await request.json());
    const container = getContainer();

    const route = await changeContentSlug(
      {
        contentRepo: container.content,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        contentId,
        translationId,
        locale: body.locale,
        namespace: body.namespace,
        newSlug: body.newSlug,
        reason: body.reason,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({ slug: route.slug, isCanonical: route.isCanonical });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  contentId: string;
  translationId: string;
}>({
  PATCH: patchHandler,
});
