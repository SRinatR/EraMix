import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission, uploadProductAsset } from '@eramix/application';
import { ValidationFailedError, parseLocale } from '@eramix/domain';
import { NextResponse } from 'next/server';

function serializeAsset(asset: {
  id: string;
  productId: string;
  assetType: string;
  status: string;
  originalFilename: string;
  displayName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  locale?: string | undefined;
  altText?: string | undefined;
  caption?: string | undefined;
  sortOrder: number;
  malwareScanStatus: string;
  malwareScanEngine: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: asset.id,
    productId: asset.productId,
    assetType: asset.assetType,
    status: asset.status,
    originalFilename: asset.originalFilename,
    displayName: asset.displayName,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    checksumSha256: asset.checksumSha256,
    locale: asset.locale,
    altText: asset.altText,
    caption: asset.caption,
    sortOrder: asset.sortOrder,
    malwareScanStatus: asset.malwareScanStatus,
    malwareScanEngine: asset.malwareScanEngine,
    version: asset.version,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

/** Admin listing — every status, ordered by sortOrder (mirrors the other admin catalog listAll()-style endpoints). */
export const GET = withApiHandler<{ productId: string }>(
  'admin.productAssets.list',
  async (request, _traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'catalog.write');
    const { productId } = await params;

    const container = getContainer();
    const assets = await container.productAssets.listByProduct(productId);
    return NextResponse.json({ items: assets.map(serializeAsset) });
  },
);

/**
 * Upload a product image/document (catalog.write). multipart/form-data:
 * file (required), displayName/locale/altText/caption (optional editorial
 * metadata) — never a client-supplied assetType or storage path (CLAUDE.md).
 */
export const POST = withApiHandler<{ productId: string }>(
  'admin.productAssets.upload',
  async (request, traceId, { params }) => {
    enforceRateLimit('upload', request);
    const actor = await requireActor(request);
    const { productId } = await params;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new ValidationFailedError('A "file" field is required (multipart/form-data).', {});
    }
    const displayNameField = formData.get('displayName');
    const localeField = formData.get('locale');
    const altTextField = formData.get('altText');
    const captionField = formData.get('caption');
    const locale = localeField ? parseLocale(String(localeField)) : undefined;

    const content = new Uint8Array(await file.arrayBuffer());
    const container = getContainer();

    const created = await uploadProductAsset(
      {
        productAssetRepo: container.productAssets,
        productRepo: container.products,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
        idGen: container.idGen,
        storage: container.storage,
        scanner: container.scanner,
        malwareScanEngineName: container.malwareScanEngineName,
      },
      {
        productId,
        filename: file.name,
        contentType: file.type,
        content,
        displayName: displayNameField ? String(displayNameField) : undefined,
        locale,
        altText: altTextField ? String(altTextField) : undefined,
        caption: captionField ? String(captionField) : undefined,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json(serializeAsset(created), { status: 201 });
  },
);
