import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { createProduct } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const indicativePriceSchema = z.object({
  priceFromMinor: z.number().int().min(0),
  currency: z.string().length(3),
  priceDisclaimer: z.string().min(1).optional(),
});

const translationSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1).optional(),
  seoTitle: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  indicativePrice: indicativePriceSchema.optional(),
});

const createProductSchema = z.object({
  sku: z.string().min(1),
  categoryId: z.string().min(1),
  translations: z.array(translationSchema).min(1),
});

/**
 * ADM-catalog: authors a new product (DRAFT) with a generated, immutable
 * publicId (CLAUDE.md — never an internal UUID as a public URL) and its
 * first translation(s). catalog.write is enforced inside createProduct.
 */
export const POST = withApiHandler('admin.products.create', async (request, traceId) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const body = createProductSchema.parse(await request.json());
  const container = getContainer();

  const created = await createProduct(
    {
      productRepo: container.products,
      categoryRepo: container.categories,
      auditRepo: container.auditEvents,
      outboxRepo: container.outbox,
      uow: container.uow,
      idGen: container.idGen,
    },
    { ...body, actorUserId: actor.userId, actorRole: actor.platformRole, traceId },
  );

  return NextResponse.json(
    {
      id: created.id,
      publicId: created.publicId,
      status: created.status,
      version: created.version,
    },
    { status: 201 },
  );
});
