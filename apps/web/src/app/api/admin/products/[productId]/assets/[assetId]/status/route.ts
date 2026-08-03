import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { transitionProductAssetStatus } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const transitionSchema = z.object({
  toStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  expectedVersion: z.number().int().min(0),
});

/** Publishing an IMAGE with no altText is rejected by transitionProductAssetStatus (accessibility gate). */
const patchHandler = withApiHandler<{ productId: string; assetId: string }>(
  'admin.productAssets.transitionStatus',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { assetId } = await params;
    const body = transitionSchema.parse(await request.json());
    const container = getContainer();

    const updated = await transitionProductAssetStatus(
      {
        productAssetRepo: container.productAssets,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        assetId,
        expectedVersion: body.expectedVersion,
        toStatus: body.toStatus,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({ id: updated.id, status: updated.status, version: updated.version });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  productId: string;
  assetId: string;
}>({
  PATCH: patchHandler,
});
