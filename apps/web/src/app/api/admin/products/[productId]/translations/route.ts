import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { addProductTranslation } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const indicativePriceSchema = z.object({
  priceFromMinor: z.number().int().min(0),
  currency: z.string().length(3),
  priceDisclaimer: z.string().min(1).optional(),
});

const addTranslationSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1).optional(),
  seoTitle: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  indicativePrice: indicativePriceSchema.optional(),
});

export const POST = withApiHandler<{ productId: string }>(
  'admin.products.addTranslation',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { productId } = await params;
    const body = addTranslationSchema.parse(await request.json());
    const container = getContainer();

    const updated = await addProductTranslation(
      {
        productRepo: container.products,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
        idGen: container.idGen,
      },
      { productId, ...body, actorUserId: actor.userId, actorRole: actor.platformRole, traceId },
    );

    return NextResponse.json(
      { id: updated.id, status: updated.status, version: updated.version },
      { status: 201 },
    );
  },
);
