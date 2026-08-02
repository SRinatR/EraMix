import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { reorderProductAssets } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const reorderSchema = z.object({
  orderedAssetIds: z.array(z.string().min(1)).min(1),
});

/** Body must list every current asset id for this product, in the new display order (packages/application/src/product-assets.ts validates the set matches exactly). */
export const PATCH = withApiHandler<{ productId: string }>(
  'admin.productAssets.reorder',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { productId } = await params;
    const body = reorderSchema.parse(await request.json());
    const container = getContainer();

    const updated = await reorderProductAssets(
      {
        productAssetRepo: container.productAssets,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        productId,
        orderedAssetIds: body.orderedAssetIds,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({
      items: updated.map((asset) => ({
        id: asset.id,
        sortOrder: asset.sortOrder,
        version: asset.version,
      })),
    });
  },
);
