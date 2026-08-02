import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { updateCategoryTranslation } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateTranslationSchema = z.object({
  expectedVersion: z.number().int().min(0),
  name: z.string().min(1).optional(),
  seoTitle: z.string().min(1).nullable().optional(),
  seoDescription: z.string().min(1).nullable().optional(),
});

/**
 * Closes the "edit an existing translation" gap CLAUDE.md names directly —
 * until now a category translation's name/SEO fields were write-once at
 * create/addTranslation time. Never accepts `slug` (that stays
 * changeCategorySlug's explicit command, matching the
 * `translations/{translationId}/slug` sibling route).
 */
export const PATCH = withApiHandler<{ categoryId: string; translationId: string }>(
  'admin.categories.updateTranslation',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { categoryId, translationId } = await params;
    const body = updateTranslationSchema.parse(await request.json());
    const container = getContainer();

    const updated = await updateCategoryTranslation(
      {
        categoryRepo: container.categories,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        categoryId,
        translationId,
        expectedVersion: body.expectedVersion,
        name: body.name,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    const translation = updated.translations.find((t) => t.id === translationId);
    return NextResponse.json({
      translationId,
      version: translation?.version ?? body.expectedVersion + 1,
    });
  },
);
