import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { updateContentTranslation } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const contentBodySchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const updateTranslationSchema = z.object({
  expectedVersion: z.number().int().min(0),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).nullable().optional(),
  content: contentBodySchema.optional(),
  seoTitle: z.string().min(1).nullable().optional(),
  seoDescription: z.string().min(1).nullable().optional(),
});

/**
 * Closes the "edit an existing translation" gap CLAUDE.md names directly —
 * until now a content translation's title/summary/body/SEO fields were
 * write-once at create/addTranslation time. Never accepts `slug` (that stays
 * changeContentSlug's explicit command, matching the sibling slug route).
 */
export const PATCH = withApiHandler<{ contentId: string; translationId: string }>(
  'admin.content.updateTranslation',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { contentId, translationId } = await params;
    const body = updateTranslationSchema.parse(await request.json());
    const container = getContainer();

    const updated = await updateContentTranslation(
      {
        contentRepo: container.content,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        contentId,
        translationId,
        expectedVersion: body.expectedVersion,
        title: body.title,
        summary: body.summary,
        content: body.content,
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
