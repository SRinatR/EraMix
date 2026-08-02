import type { ProductAssetMetadataPatch, ProductAssetRepository } from '@eramix/application';
import { ResourceNotFoundError, type ProductAsset, type PublicationStatus } from '@eramix/domain';
import type { ProductAsset as ProductAssetRow } from '../generated/prisma/client.js';
import { assertOptimisticLockAcquired } from '../prisma-error-mapping.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaProductAssetRepository implements ProductAssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ProductAsset | undefined> {
    const row = await resolveClient(this.prisma).productAsset.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async listByProduct(productId: string): Promise<readonly ProductAsset[]> {
    const rows = await resolveClient(this.prisma).productAsset.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async listPublishedByProduct(productId: string): Promise<readonly ProductAsset[]> {
    const rows = await resolveClient(this.prisma).productAsset.findMany({
      where: { productId, status: 'PUBLISHED' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async create(
    asset: Omit<ProductAsset, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProductAsset> {
    const row = await resolveClient(this.prisma).productAsset.create({
      data: {
        id: asset.id,
        productId: asset.productId,
        assetType: asset.assetType,
        status: asset.status,
        storageKey: asset.storageKey,
        originalFilename: asset.originalFilename,
        displayName: asset.displayName,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        checksumSha256: asset.checksumSha256,
        locale: asset.locale ?? null,
        altText: asset.altText ?? null,
        caption: asset.caption ?? null,
        sortOrder: asset.sortOrder,
        malwareScanStatus: asset.malwareScanStatus,
        malwareScanEngine: asset.malwareScanEngine,
        uploadedByUserId: asset.uploadedByUserId ?? null,
      },
    });
    return toDomain(row);
  }

  async updateMetadata(
    id: string,
    expectedVersion: number,
    patch: ProductAssetMetadataPatch,
  ): Promise<ProductAsset> {
    const client = resolveClient(this.prisma);
    const { count } = await client.productAsset.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.altText !== undefined ? { altText: patch.altText } : {}),
        ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
        ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        version: { increment: 1 },
      },
    });
    await assertOptimisticLockAcquired(
      count,
      `ProductAsset ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    return this.mustFindById(id);
  }

  async updateStatus(
    id: string,
    expectedVersion: number,
    status: PublicationStatus,
  ): Promise<ProductAsset> {
    const client = resolveClient(this.prisma);
    const { count } = await client.productAsset.updateMany({
      where: { id, version: expectedVersion },
      data: { status, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `ProductAsset ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    return this.mustFindById(id);
  }

  async delete(id: string): Promise<void> {
    await resolveClient(this.prisma).productAsset.delete({ where: { id } });
  }

  private async mustFindById(id: string): Promise<ProductAsset> {
    const updated = await this.findById(id);
    if (!updated) {
      throw new ResourceNotFoundError(`ProductAsset ${id} not found after update.`, { id });
    }
    return updated;
  }
}

function toDomain(row: ProductAssetRow): ProductAsset {
  return {
    id: row.id,
    productId: row.productId,
    assetType: row.assetType,
    status: row.status,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    displayName: row.displayName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    locale: nullToUndefined(row.locale),
    altText: nullToUndefined(row.altText),
    caption: nullToUndefined(row.caption),
    sortOrder: row.sortOrder,
    malwareScanStatus: row.malwareScanStatus,
    malwareScanEngine: row.malwareScanEngine,
    uploadedByUserId: nullToUndefined(row.uploadedByUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
