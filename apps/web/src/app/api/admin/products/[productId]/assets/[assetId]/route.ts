import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { removeProductAsset, updateProductAssetMetadata } from '@eramix/application';
import { SUPPORTED_LOCALES } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateMetadataSchema = z.object({
  expectedVersion: z.number().int().min(0),
  displayName: z.string().min(1).optional(),
  altText: z.string().min(1).nullable().optional(),
  caption: z.string().min(1).nullable().optional(),
  locale: z.enum(SUPPORTED_LOCALES).nullable().optional(),
});

const patchHandler = withApiHandler<{ productId: string; assetId: string }>(
  'admin.productAssets.updateMetadata',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { assetId } = await params;
    const body = updateMetadataSchema.parse(await request.json());
    const container = getContainer();

    const updated = await updateProductAssetMetadata(
      {
        productAssetRepo: container.productAssets,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        assetId,
        expectedVersion: body.expectedVersion,
        displayName: body.displayName,
        altText: body.altText,
        caption: body.caption,
        locale: body.locale,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json({
      id: updated.id,
      displayName: updated.displayName,
      altText: updated.altText,
      caption: updated.caption,
      locale: updated.locale,
      sortOrder: updated.sortOrder,
      version: updated.version,
    });
  },
);

const removeSchema = z.object({ confirm: z.literal(true) });

/** Irreversible — the client must send {"confirm": true} (packages/application/src/product-assets.ts's own anti-footgun gate). */
const deleteHandler = withApiHandler<{ productId: string; assetId: string }>(
  'admin.productAssets.remove',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { assetId } = await params;
    const body = removeSchema.parse(await request.json());
    const container = getContainer();

    await removeProductAsset(
      {
        productAssetRepo: container.productAssets,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
        storage: container.storage,
      },
      {
        assetId,
        confirm: body.confirm,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return new NextResponse(null, { status: 204 });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  productId: string;
  assetId: string;
}>({
  PATCH: patchHandler,
  DELETE: deleteHandler,
});
