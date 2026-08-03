import {
  ResourceNotFoundError,
  ValidationFailedError,
  sanitizeDisplayName,
  sanitizeFilenameForStorage,
  validateUpload,
  type LocaleCode,
  type PlatformRole,
  type ProductAsset,
  type PublicationStatus,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { IdGenerator, MalwareScanner, StorageProvider, UnitOfWork } from './ports.js';
import type {
  AuditEventRepository,
  OutboxMessageRepository,
  ProductAssetRepository,
  ProductRepository,
} from './repositories.js';

/**
 * Product image/document attachments (Phase 6). Binary content only ever
 * reaches StorageProvider after validation (domain-layer allowlist/size/
 * signature check) AND a clean malware-scan result — mirrors
 * packages/application/src/uploads.ts's "never call storage.put on a failed
 * scan/validation", extended with product ownership, editorial metadata,
 * ordering, and a publish gate.
 */

export interface ProductAssetDeps {
  readonly productAssetRepo: ProductAssetRepository;
  readonly productRepo: Pick<ProductRepository, 'findById'>;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
  readonly idGen: IdGenerator;
  readonly storage: StorageProvider;
  readonly scanner: MalwareScanner;
  /**
   * Honest provenance string for the currently wired scanner (CLAUDE.md: "do
   * not falsely claim files were scanned") — e.g.
   * "dev-stub (not production-grade; ADR-0006 pending)". Supplied by the
   * composition root, not inferred from the port, since the port itself
   * carries no identity/version information.
   */
  readonly malwareScanEngineName: string;
}

export interface UploadProductAssetInput {
  readonly productId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
  readonly displayName?: string | undefined;
  readonly locale?: LocaleCode | undefined;
  readonly altText?: string | undefined;
  readonly caption?: string | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function uploadProductAsset(
  deps: ProductAssetDeps,
  input: UploadProductAssetInput,
): Promise<ProductAsset> {
  requirePermission(input.actorRole, 'catalog.write');

  const product = await deps.productRepo.findById(input.productId);
  if (!product) {
    throw new ResourceNotFoundError(`Product ${input.productId} not found.`, {
      productId: input.productId,
    });
  }

  const allowed = validateUpload({
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.content.byteLength,
    headerBytes: input.content.slice(0, 16),
  });

  const scanResult = await deps.scanner.scan(input.content);
  if (!scanResult.clean) {
    throw new ValidationFailedError('Upload failed malware scanning.', {
      filename: input.filename,
      signature: scanResult.signature,
    });
  }

  const sanitizedFilename = sanitizeFilenameForStorage(input.filename);
  const storageKey = `product-assets/${await deps.idGen.nextId()}-${sanitizedFilename}`;
  const stored = await deps.storage.put(storageKey, input.content, input.contentType);

  const displayName = sanitizeDisplayName(input.displayName ?? input.filename);
  const assetId = await deps.idGen.nextId();

  return deps.uow.runInTransaction(async () => {
    const created = await deps.productAssetRepo.create({
      id: assetId,
      productId: input.productId,
      assetType: allowed.assetCategory,
      status: 'DRAFT',
      storageKey: stored.key,
      originalFilename: input.filename,
      displayName,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
      locale: input.locale,
      altText: input.altText,
      caption: input.caption,
      sortOrder: 0,
      malwareScanStatus: 'CLEAN',
      malwareScanEngine: deps.malwareScanEngineName,
      uploadedByUserId: input.actorUserId,
    });
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product_asset.uploaded',
      entityType: 'ProductAsset',
      entityId: assetId,
      metadata: {
        productId: input.productId,
        assetType: created.assetType,
        contentType: created.contentType,
        sizeBytes: created.sizeBytes,
      },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'ProductAsset',
      aggregateId: assetId,
      eventType: 'product_asset.uploaded',
      payload: { productId: input.productId, assetType: created.assetType },
    });
    return created;
  });
}

export interface UpdateProductAssetMetadataInput {
  readonly assetId: string;
  readonly expectedVersion: number;
  readonly displayName?: string | undefined;
  readonly altText?: string | null | undefined;
  readonly caption?: string | null | undefined;
  readonly locale?: LocaleCode | null | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function updateProductAssetMetadata(
  deps: Pick<ProductAssetDeps, 'productAssetRepo' | 'auditRepo' | 'outboxRepo' | 'uow'>,
  input: UpdateProductAssetMetadataInput,
): Promise<ProductAsset> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.productAssetRepo.findById(input.assetId);
    if (!existing) {
      throw new ResourceNotFoundError(`ProductAsset ${input.assetId} not found.`, {
        id: input.assetId,
      });
    }
    const displayName =
      input.displayName !== undefined ? sanitizeDisplayName(input.displayName) : undefined;
    const updated = await deps.productAssetRepo.updateMetadata(
      input.assetId,
      input.expectedVersion,
      {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(input.altText !== undefined ? { altText: input.altText } : {}),
        ...(input.caption !== undefined ? { caption: input.caption } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      },
    );
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product_asset.metadata_updated',
      entityType: 'ProductAsset',
      entityId: input.assetId,
      metadata: { productId: existing.productId },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'ProductAsset',
      aggregateId: input.assetId,
      eventType: 'product_asset.metadata_updated',
      payload: { productId: existing.productId },
    });
    return updated;
  });
}

export interface ReorderProductAssetsInput {
  readonly productId: string;
  /** Complete, ordered list of every asset id belonging to this product — the new sortOrder is each entry's index. */
  readonly orderedAssetIds: readonly string[];
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function reorderProductAssets(
  deps: Pick<ProductAssetDeps, 'productAssetRepo' | 'auditRepo' | 'outboxRepo' | 'uow'>,
  input: ReorderProductAssetsInput,
): Promise<readonly ProductAsset[]> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.productAssetRepo.listByProduct(input.productId);
    const existingIds = new Set(existing.map((asset) => asset.id));
    const requestedIds = new Set(input.orderedAssetIds);
    if (
      existingIds.size !== requestedIds.size ||
      [...existingIds].some((id) => !requestedIds.has(id))
    ) {
      throw new ValidationFailedError(
        'orderedAssetIds must be exactly the current set of assets for this product.',
        { productId: input.productId },
      );
    }

    const byId = new Map(existing.map((asset) => [asset.id, asset]));
    const updated: ProductAsset[] = [];
    for (const [index, assetId] of input.orderedAssetIds.entries()) {
      const asset = byId.get(assetId)!;
      updated.push(
        await deps.productAssetRepo.updateMetadata(assetId, asset.version, { sortOrder: index }),
      );
    }
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product_asset.reordered',
      entityType: 'Product',
      entityId: input.productId,
      metadata: { orderedAssetIds: input.orderedAssetIds },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Product',
      aggregateId: input.productId,
      eventType: 'product_asset.reordered',
      payload: { orderedAssetIds: input.orderedAssetIds },
    });
    return updated;
  });
}

export interface TransitionProductAssetStatusInput {
  readonly assetId: string;
  readonly expectedVersion: number;
  readonly toStatus: PublicationStatus;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function transitionProductAssetStatus(
  deps: Pick<ProductAssetDeps, 'productAssetRepo' | 'auditRepo' | 'outboxRepo' | 'uow'>,
  input: TransitionProductAssetStatusInput,
): Promise<ProductAsset> {
  requirePermission(input.actorRole, 'catalog.write');
  return deps.uow.runInTransaction(async () => {
    const existing = await deps.productAssetRepo.findById(input.assetId);
    if (!existing) {
      throw new ResourceNotFoundError(`ProductAsset ${input.assetId} not found.`, {
        id: input.assetId,
      });
    }
    if (input.toStatus === 'PUBLISHED' && existing.assetType === 'IMAGE' && !existing.altText) {
      throw new ValidationFailedError(
        'An image must have alt text before it can be published (accessibility requirement).',
        { assetId: input.assetId },
      );
    }
    const updated = await deps.productAssetRepo.updateStatus(
      input.assetId,
      input.expectedVersion,
      input.toStatus,
    );
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product_asset.status_changed',
      entityType: 'ProductAsset',
      entityId: input.assetId,
      metadata: { previousStatus: existing.status, newStatus: input.toStatus },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'ProductAsset',
      aggregateId: input.assetId,
      eventType: 'product_asset.status_changed',
      payload: { previousStatus: existing.status, newStatus: input.toStatus },
    });
    return updated;
  });
}

export interface RemoveProductAssetInput {
  readonly assetId: string;
  /** Explicit anti-footgun for an irreversible action — must be exactly `true`. */
  readonly confirm: boolean;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

/**
 * Irreversible: deletes the storage object, then the metadata row, in that
 * order — a DB row can never outlive its file (the worse failure mode: a
 * live-looking link to a missing file), at the cost of a possible orphaned
 * file if the DB half fails afterward (a harmless, cleanable leak, not a
 * broken user-facing link).
 */
export async function removeProductAsset(
  deps: Pick<ProductAssetDeps, 'productAssetRepo' | 'auditRepo' | 'outboxRepo' | 'uow' | 'storage'>,
  input: RemoveProductAssetInput,
): Promise<void> {
  requirePermission(input.actorRole, 'catalog.write');
  if (input.confirm !== true) {
    throw new ValidationFailedError('Removal requires explicit confirmation (confirm: true).', {
      assetId: input.assetId,
    });
  }
  const existing = await deps.productAssetRepo.findById(input.assetId);
  if (!existing) {
    throw new ResourceNotFoundError(`ProductAsset ${input.assetId} not found.`, {
      id: input.assetId,
    });
  }

  await deps.storage.delete(existing.storageKey);

  await deps.uow.runInTransaction(async () => {
    await deps.productAssetRepo.delete(input.assetId);
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product_asset.removed',
      entityType: 'ProductAsset',
      entityId: input.assetId,
      metadata: {
        productId: existing.productId,
        originalFilename: existing.originalFilename,
        assetType: existing.assetType,
      },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'ProductAsset',
      aggregateId: input.assetId,
      eventType: 'product_asset.removed',
      payload: { productId: existing.productId },
    });
  });
}
