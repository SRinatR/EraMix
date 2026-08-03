import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { getActor } from '@/server/session';
import { hasPermission } from '@eramix/application';
import { ALLOWED_UPLOAD_TYPES, ResourceNotFoundError } from '@eramix/domain';
import { NextResponse } from 'next/server';

const DOWNLOAD_TTL_SECONDS = 300;

function extensionFor(contentType: string): string {
  const match = ALLOWED_UPLOAD_TYPES.find((type) => type.mimeType === contentType);
  return match?.extensions[0] ?? 'bin';
}

/**
 * Visibility-aware product asset download (CLAUDE.md: "Make public documents
 * downloadable only when their visibility/authorization rules allow it").
 * PUBLISHED assets are downloadable by anyone (same as the rest of the
 * public catalog); DRAFT/ARCHIVED assets are an authenticated admin preview
 * only. Redirects to a time-limited signed URL that carries a safe,
 * editorial Content-Disposition filename — never the internal storage key
 * (see apps/web/src/app/api/media/download/route.ts's downloadFilename
 * handling).
 */
const getHandler = withApiHandler<{ publicId: string; assetId: string }>(
  'catalog.products.assets.download',
  async (request, _traceId, { params }) => {
    enforceRateLimit('search', request);
    const { publicId, assetId } = await params;
    const container = getContainer();

    const product = await container.products.findByPublicId(publicId);
    if (!product) {
      throw new ResourceNotFoundError(`Product "${publicId}" not found.`, { publicId });
    }
    const asset = await container.productAssets.findById(assetId);
    if (!asset || asset.productId !== product.id) {
      throw new ResourceNotFoundError(`Asset "${assetId}" not found on product "${publicId}".`, {
        publicId,
        assetId,
      });
    }

    // An asset can only be unauthenticated-downloadable when BOTH its own
    // status and its parent product's status are PUBLISHED — an asset
    // marked PUBLISHED on a still-DRAFT product must not leak ahead of the
    // product itself (which the public catalog API/pages already 404 for).
    if (asset.status !== 'PUBLISHED' || product.status !== 'PUBLISHED') {
      const actor = await getActor(request);
      if (!actor || !hasPermission(actor.platformRole, 'catalog.write')) {
        // Same response as "does not exist" — never confirm to an
        // unauthorized caller that an unpublished asset/product exists.
        throw new ResourceNotFoundError(`Asset "${assetId}" not found on product "${publicId}".`, {
          publicId,
          assetId,
        });
      }
    }

    const safeFilename = `${asset.displayName}.${extensionFor(asset.contentType)}`;
    const signedUrl = await container.storage.createSignedDownloadUrl(
      asset.storageKey,
      DOWNLOAD_TTL_SECONDS,
      safeFilename,
    );
    return NextResponse.redirect(signedUrl);
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  publicId: string;
  assetId: string;
}>({
  GET: getHandler,
});
