import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { createCategory } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const translationSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  name: z.string().min(1),
  seoTitle: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});

const createCategorySchema = z.object({
  parentId: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  translations: z.array(translationSchema).min(1),
});

/**
 * ADM-catalog: authors a new category (DRAFT) plus its first translation(s),
 * establishing an initial canonical route for any translation that carries a
 * slug. catalog.write is enforced inside createCategory (application layer),
 * not duplicated here — same convention as the status-transition routes.
 */
const postHandler = withApiHandler('admin.categories.create', async (request, traceId) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const body = createCategorySchema.parse(await request.json());
  const container = getContainer();

  const created = await createCategory(
    {
      categoryRepo: container.categories,
      auditRepo: container.auditEvents,
      outboxRepo: container.outbox,
      uow: container.uow,
      idGen: container.idGen,
    },
    { ...body, actorUserId: actor.userId, actorRole: actor.platformRole, traceId },
  );

  return NextResponse.json(
    { id: created.id, status: created.status, version: created.version },
    { status: 201 },
  );
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  POST: postHandler,
});
