import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { addContentTranslation } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const bodySchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const addTranslationSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  content: bodySchema,
  seoTitle: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});

export const POST = withApiHandler<{ contentId: string }>(
  'admin.content.addTranslation',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { contentId } = await params;
    const body = addTranslationSchema.parse(await request.json());
    const container = getContainer();

    const updated = await addContentTranslation(
      {
        contentRepo: container.content,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
        idGen: container.idGen,
      },
      { contentId, ...body, actorUserId: actor.userId, actorRole: actor.platformRole, traceId },
    );

    return NextResponse.json(
      { id: updated.id, status: updated.status, version: updated.version },
      { status: 201 },
    );
  },
);
