import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { setProductDirectSaleEnabled } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const directSaleSchema = z.object({
  directSaleEnabled: z.boolean(),
  expectedVersion: z.number().int().min(0),
  reason: z.string().min(1).max(500).optional(),
});

/**
 * The explicit per-product opt-in ADR-0019 requires before any of the
 * product's offers can ever publish. Flipping this alone never syndicates
 * anything — PlatformSettings.merchantCenterEnabled is still hard-false.
 */
const patchHandler = withApiHandler<{ productId: string }>(
  'admin.products.setDirectSaleEnabled',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { productId } = await params;
    const body = directSaleSchema.parse(await request.json());
    const container = getContainer();

    const updated = await setProductDirectSaleEnabled(
      {
        productRepo: container.products,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        productId,
        expectedVersion: body.expectedVersion,
        directSaleEnabled: body.directSaleEnabled,
        reason: body.reason,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({
      id: updated.id,
      directSaleEnabled: updated.directSaleEnabled,
      version: updated.version,
    });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  productId: string;
}>({
  PATCH: patchHandler,
});
