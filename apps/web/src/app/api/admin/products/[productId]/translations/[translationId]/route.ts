import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { updateProductTranslation } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const indicativePriceSchema = z.object({
  priceFromMinor: z.number().int().min(0).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  priceDisclaimer: z.string().min(1).optional(),
});

const updateTranslationSchema = z.object({
  expectedVersion: z.number().int().min(0),
  name: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  seoTitle: z.string().min(1).nullable().optional(),
  seoDescription: z.string().min(1).nullable().optional(),
  indicativePrice: indicativePriceSchema.nullable().optional(),
});

/**
 * Closes the "edit an existing translation" gap CLAUDE.md names directly —
 * until now a product translation's name/description/SEO fields/indicative
 * price were write-once at create/addTranslation time. Never accepts `slug`
 * (that stays a separate command, matching the category/content siblings).
 */
export const PATCH = withApiHandler<{ productId: string; translationId: string }>(
  'admin.products.updateTranslation',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { productId, translationId } = await params;
    const body = updateTranslationSchema.parse(await request.json());
    const container = getContainer();

    const updated = await updateProductTranslation(
      {
        productRepo: container.products,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        productId,
        translationId,
        expectedVersion: body.expectedVersion,
        name: body.name,
        description: body.description,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        indicativePrice: body.indicativePrice,
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
