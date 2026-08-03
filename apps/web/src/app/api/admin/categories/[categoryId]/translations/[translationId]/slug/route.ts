import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { changeCategorySlug } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const changeSlugSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  newSlug: z.string().min(1),
  reason: z.string().min(1).optional(),
});

/**
 * Phase 6's named "explicit slug operation" deliverable — changeCategorySlug
 * (packages/application/src/slug-change.ts) already existed but had no route
 * handler. Slug changes are explicit commands, not a title-edit side effect
 * (CLAUDE.md): the previous canonical route is demoted, never deleted, so it
 * keeps resolving as a one-hop 308 redirect (route-resolution.ts).
 */
const patchHandler = withApiHandler<{ categoryId: string; translationId: string }>(
  'admin.categories.changeSlug',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { categoryId, translationId } = await params;
    const body = changeSlugSchema.parse(await request.json());
    const container = getContainer();

    const route = await changeCategorySlug(
      {
        categoryRepo: container.categories,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        categoryId,
        translationId,
        locale: body.locale,
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
  categoryId: string;
  translationId: string;
}>({
  PATCH: patchHandler,
});
