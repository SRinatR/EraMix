import { AccessDeniedError, ResourceNotFoundError, ValidationFailedError } from '@eramix/domain';
import type { ProductAsset } from '@eramix/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  removeProductAsset,
  reorderProductAssets,
  transitionProductAssetStatus,
  updateProductAssetMetadata,
  uploadProductAsset,
} from './product-assets.js';
import type { AuditEventRepository, OutboxMessageRepository } from './repositories.js';

const PNG_CONTENT = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(20).fill(0)]);

class InMemoryUnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class SequentialIdGenerator {
  private counter = 0;
  nextId(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

function fakeAuditRepo(): AuditEventRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    record: (event) => {
      calls.push(event);
      return Promise.resolve({ id: 'audit-1', createdAt: new Date(), ...event });
    },
    listByEntity: () => Promise.resolve([]),
  };
}

function fakeOutboxRepo(): OutboxMessageRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    enqueue: (message) => {
      calls.push(message);
      return Promise.resolve({
        id: 'outbox-1',
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        ...message,
      });
    },
    claimPending: () => Promise.resolve([]),
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
    markDeadLetter: () => Promise.resolve(),
  };
}

function makeAsset(overrides: Partial<ProductAsset> = {}): ProductAsset {
  return {
    id: 'asset-1',
    productId: 'product-1',
    assetType: 'IMAGE',
    status: 'DRAFT',
    storageKey: 'product-assets/id-1-photo.png',
    originalFilename: 'photo.png',
    displayName: 'Photo',
    contentType: 'image/png',
    sizeBytes: 1024,
    checksumSha256: 'a'.repeat(64),
    sortOrder: 0,
    malwareScanStatus: 'CLEAN',
    malwareScanEngine: 'dev-stub',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function fakeStorage() {
  const puts: unknown[] = [];
  const deletes: string[] = [];
  return {
    puts,
    deletes,
    put: (key: string, content: Uint8Array, contentType: string) => {
      puts.push({ key, contentType });
      return Promise.resolve({
        key,
        contentType,
        sizeBytes: content.byteLength,
        checksumSha256: 'fake-checksum',
      });
    },
    createSignedDownloadUrl: () => Promise.resolve('https://example.test/signed'),
    delete: (key: string) => {
      deletes.push(key);
      return Promise.resolve();
    },
  };
}

function cleanScanner() {
  return { scan: () => Promise.resolve({ clean: true }) };
}

describe('uploadProductAsset', () => {
  it('denies a role without catalog.write', async () => {
    const productRepo = { findById: vi.fn() };
    await expect(
      uploadProductAsset(
        {
          productAssetRepo: { create: vi.fn() } as never,
          productRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
          storage: fakeStorage(),
          scanner: cleanScanner(),
          malwareScanEngineName: 'dev-stub',
        },
        {
          productId: 'product-1',
          filename: 'photo.png',
          contentType: 'image/png',
          content: PNG_CONTENT,
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
    expect(productRepo.findById).not.toHaveBeenCalled();
  });

  it('throws ResourceNotFoundError when the product does not exist', async () => {
    await expect(
      uploadProductAsset(
        {
          productAssetRepo: { create: vi.fn() } as never,
          productRepo: { findById: () => Promise.resolve(undefined) },
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
          storage: fakeStorage(),
          scanner: cleanScanner(),
          malwareScanEngineName: 'dev-stub',
        },
        {
          productId: 'missing',
          filename: 'photo.png',
          contentType: 'image/png',
          content: PNG_CONTENT,
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('rejects an infected file before ever calling storage.put or creating a row', async () => {
    const storage = fakeStorage();
    const create = vi.fn();
    await expect(
      uploadProductAsset(
        {
          productAssetRepo: { create } as never,
          productRepo: { findById: () => Promise.resolve({ id: 'product-1' }) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
          storage,
          scanner: { scan: () => Promise.resolve({ clean: false, signature: 'EICAR' }) },
          malwareScanEngineName: 'dev-stub',
        },
        {
          productId: 'product-1',
          filename: 'photo.png',
          contentType: 'image/png',
          content: PNG_CONTENT,
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
    expect(storage.puts).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a file that fails validation before ever calling the scanner or storage', async () => {
    const storage = fakeStorage();
    let scannerCalled = false;
    await expect(
      uploadProductAsset(
        {
          productAssetRepo: { create: vi.fn() } as never,
          productRepo: { findById: () => Promise.resolve({ id: 'product-1' }) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          idGen: new SequentialIdGenerator(),
          storage,
          scanner: {
            scan: () => {
              scannerCalled = true;
              return Promise.resolve({ clean: true });
            },
          },
          malwareScanEngineName: 'dev-stub',
        },
        {
          productId: 'product-1',
          filename: 'script.exe',
          contentType: 'application/x-msdownload',
          content: PNG_CONTENT,
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
    expect(scannerCalled).toBe(false);
    expect(storage.puts).toHaveLength(0);
  });

  it('stores a valid clean image under a generated key and records the honest scan-engine provenance', async () => {
    const storage = fakeStorage();
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();
    let capturedCreate: unknown;
    const productAssetRepo = {
      create: vi.fn((asset: unknown) => {
        capturedCreate = asset;
        return Promise.resolve({
          ...(asset as ProductAsset),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
    };

    const result = await uploadProductAsset(
      {
        productAssetRepo: productAssetRepo as never,
        productRepo: { findById: () => Promise.resolve({ id: 'product-1' }) } as never,
        auditRepo,
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
        storage,
        scanner: cleanScanner(),
        malwareScanEngineName: 'dev-stub (not production-grade)',
      },
      {
        productId: 'product-1',
        filename: '../../etc/photo.png',
        contentType: 'image/png',
        content: PNG_CONTENT,
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(storage.puts).toHaveLength(1);
    const putKey = (storage.puts[0] as { key: string }).key;
    expect(putKey).not.toContain('/../');
    expect(putKey.startsWith('product-assets/')).toBe(true);
    expect(capturedCreate).toMatchObject({
      productId: 'product-1',
      assetType: 'IMAGE',
      status: 'DRAFT',
      malwareScanStatus: 'CLEAN',
      malwareScanEngine: 'dev-stub (not production-grade)',
      sortOrder: 0,
    });
    expect(result).toBeDefined();
    expect(auditRepo.calls).toEqual([
      expect.objectContaining({ action: 'product_asset.uploaded' }),
    ]);
    expect(outboxRepo.calls).toEqual([
      expect.objectContaining({ eventType: 'product_asset.uploaded' }),
    ]);
  });

  it('infers DOCUMENT assetType for a PDF', async () => {
    const storage = fakeStorage();
    let capturedCreate: unknown;
    const productAssetRepo = {
      create: vi.fn((asset: unknown) => {
        capturedCreate = asset;
        return Promise.resolve(asset as ProductAsset);
      }),
    };
    const PDF_CONTENT = new Uint8Array([0x25, 0x50, 0x44, 0x46, ...new Array(20).fill(0)]);

    await uploadProductAsset(
      {
        productAssetRepo: productAssetRepo as never,
        productRepo: { findById: () => Promise.resolve({ id: 'product-1' }) } as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
        idGen: new SequentialIdGenerator(),
        storage,
        scanner: cleanScanner(),
        malwareScanEngineName: 'dev-stub',
      },
      {
        productId: 'product-1',
        filename: 'datasheet.pdf',
        contentType: 'application/pdf',
        content: PDF_CONTENT,
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect((capturedCreate as { assetType: string }).assetType).toBe('DOCUMENT');
  });
});

describe('updateProductAssetMetadata', () => {
  it('throws ResourceNotFoundError for an unknown asset', async () => {
    await expect(
      updateProductAssetMetadata(
        {
          productAssetRepo: { findById: () => Promise.resolve(undefined) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          assetId: 'missing',
          expectedVersion: 0,
          displayName: 'New name',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('sanitizes the display name before writing it', async () => {
    const asset = makeAsset();
    const updateMetadata = vi.fn(() => Promise.resolve({ ...asset, displayName: 'Clean name' }));
    await updateProductAssetMetadata(
      {
        productAssetRepo: { findById: () => Promise.resolve(asset), updateMetadata } as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        assetId: 'asset-1',
        expectedVersion: 0,
        displayName: '  Clean name  ',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(updateMetadata).toHaveBeenCalledWith(
      'asset-1',
      0,
      expect.objectContaining({ displayName: 'Clean name' }),
    );
  });
});

describe('reorderProductAssets', () => {
  it('rejects an incomplete/mismatched id set', async () => {
    const assets = [makeAsset({ id: 'a' }), makeAsset({ id: 'b' })];
    await expect(
      reorderProductAssets(
        {
          productAssetRepo: { listByProduct: () => Promise.resolve(assets) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          productId: 'product-1',
          orderedAssetIds: ['a'],
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('assigns sequential sortOrder in the requested order', async () => {
    const assets = [makeAsset({ id: 'a', sortOrder: 0 }), makeAsset({ id: 'b', sortOrder: 1 })];
    const calls: unknown[] = [];
    const productAssetRepo = {
      listByProduct: () => Promise.resolve(assets),
      updateMetadata: (id: string, version: number, patch: unknown) => {
        calls.push({ id, version, patch });
        const asset = assets.find((a) => a.id === id)!;
        return Promise.resolve({ ...asset, ...(patch as object) });
      },
    };
    const result = await reorderProductAssets(
      {
        productAssetRepo: productAssetRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        productId: 'product-1',
        orderedAssetIds: ['b', 'a'],
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(calls).toEqual([
      { id: 'b', version: 0, patch: { sortOrder: 0 } },
      { id: 'a', version: 0, patch: { sortOrder: 1 } },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('transitionProductAssetStatus', () => {
  it('rejects publishing an IMAGE with no alt text', async () => {
    const asset = makeAsset({ assetType: 'IMAGE', altText: undefined });
    await expect(
      transitionProductAssetStatus(
        {
          productAssetRepo: {
            findById: () => Promise.resolve(asset),
            updateStatus: vi.fn(),
          } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          assetId: 'asset-1',
          expectedVersion: 0,
          toStatus: 'PUBLISHED',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('allows publishing an IMAGE that has alt text', async () => {
    const asset = makeAsset({ assetType: 'IMAGE', altText: 'Front panel' });
    const published = { ...asset, status: 'PUBLISHED' as const };
    const updateStatus = vi.fn(() => Promise.resolve(published));
    const result = await transitionProductAssetStatus(
      {
        productAssetRepo: { findById: () => Promise.resolve(asset), updateStatus } as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        assetId: 'asset-1',
        expectedVersion: 0,
        toStatus: 'PUBLISHED',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(result.status).toBe('PUBLISHED');
  });

  it('allows publishing a DOCUMENT with no alt text (accessibility gate is image-only)', async () => {
    const asset = makeAsset({ assetType: 'DOCUMENT', altText: undefined });
    const published = { ...asset, status: 'PUBLISHED' as const };
    const updateStatus = vi.fn(() => Promise.resolve(published));
    const result = await transitionProductAssetStatus(
      {
        productAssetRepo: { findById: () => Promise.resolve(asset), updateStatus } as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        assetId: 'asset-1',
        expectedVersion: 0,
        toStatus: 'PUBLISHED',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(result.status).toBe('PUBLISHED');
  });
});

describe('removeProductAsset', () => {
  it('rejects removal without explicit confirm: true', async () => {
    await expect(
      removeProductAsset(
        {
          productAssetRepo: { findById: vi.fn() } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          storage: fakeStorage(),
        },
        {
          assetId: 'asset-1',
          confirm: false,
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('throws ResourceNotFoundError for an unknown asset', async () => {
    await expect(
      removeProductAsset(
        {
          productAssetRepo: { findById: () => Promise.resolve(undefined) } as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
          storage: fakeStorage(),
        },
        {
          assetId: 'missing',
          confirm: true,
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('deletes the storage object then the DB row, and records an audit snapshot', async () => {
    const asset = makeAsset();
    const storage = fakeStorage();
    const deleteRow = vi.fn(() => Promise.resolve());
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    await removeProductAsset(
      {
        productAssetRepo: { findById: () => Promise.resolve(asset), delete: deleteRow } as never,
        auditRepo,
        outboxRepo,
        uow: new InMemoryUnitOfWork(),
        storage,
      },
      {
        assetId: 'asset-1',
        confirm: true,
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(storage.deletes).toEqual([asset.storageKey]);
    expect(deleteRow).toHaveBeenCalledWith('asset-1');
    expect(auditRepo.calls).toEqual([
      expect.objectContaining({
        action: 'product_asset.removed',
        metadata: expect.objectContaining({ originalFilename: asset.originalFilename }),
      }),
    ]);
    expect(outboxRepo.calls).toEqual([
      expect.objectContaining({ eventType: 'product_asset.removed' }),
    ]);
  });
});
