import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { addCategoryTranslation } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const addTranslationSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  name: z.string().min(1),
  seoTitle: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});

export const POST = withApiHandler<{ categoryId: string }>(
  'admin.categories.addTranslation',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { categoryId } = await params;
    const body = addTranslationSchema.parse(await request.json());
    const container = getContainer();

    const updated = await addCategoryTranslation(
      {
        categoryRepo: container.categories,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
        idGen: container.idGen,
      },
      { categoryId, ...body, actorUserId: actor.userId, actorRole: actor.platformRole, traceId },
    );

    return NextResponse.json(
      { id: updated.id, status: updated.status, version: updated.version },
      { status: 201 },
    );
  },
);
