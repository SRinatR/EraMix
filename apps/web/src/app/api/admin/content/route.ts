import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { createContent } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Body is a list of plain-text paragraphs (rendered as one <p> per entry —
 * see apps/web/src/components/content-body.tsx). Kept deliberately simple
 * (no HTML/markdown) so it can render with React's default text escaping and
 * needs no sanitizer; a richer block format is a documented future increment,
 * not invented here.
 */
const bodySchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const translationSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  content: bodySchema,
  seoTitle: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});

const createContentSchema = z.object({
  type: z.enum(['ARTICLE', 'PAGE', 'FAQ_ITEM']),
  translations: z.array(translationSchema).min(1),
});

/**
 * ADM-content: authors a new Article/Page/FAQ item (DRAFT) with its first
 * translation(s). ARTICLE/PAGE translations that carry a slug get an initial
 * canonical route in the matching namespace; FAQ_ITEM has none (TZ Appendix
 * F.3). content.write is enforced inside createContent.
 */
const postHandler = withApiHandler('admin.content.create', async (request, traceId) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const body = createContentSchema.parse(await request.json());
  const container = getContainer();

  const created = await createContent(
    {
      contentRepo: container.content,
      auditRepo: container.auditEvents,
      outboxRepo: container.outbox,
      uow: container.uow,
      idGen: container.idGen,
    },
    { ...body, actorUserId: actor.userId, actorRole: actor.platformRole, traceId },
  );

  return NextResponse.json(
    { id: created.id, type: created.type, status: created.status, version: created.version },
    { status: 201 },
  );
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  POST: postHandler,
});
