import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findByPublicId = vi.fn();
const findAssetById = vi.fn();
const createSignedDownloadUrl = vi.fn();

vi.mock('@/server/container', () => ({
  getContainer: () => ({
    products: { findByPublicId },
    productAssets: { findById: findAssetById },
    storage: { createSignedDownloadUrl },
  }),
}));

const { GET } = await import('./route.js');

const context = (publicId: string, assetId: string) => ({
  params: Promise.resolve({ publicId, assetId }),
});

describe('GET /api/catalog/products/{publicId}/assets/{assetId}/download', () => {
  beforeEach(() => {
    findByPublicId.mockReset();
    findAssetById.mockReset();
    createSignedDownloadUrl.mockReset();
  });

  it('redirects (307, never cached as permanent) to a time-limited signed URL for a PUBLISHED asset on a PUBLISHED product', async () => {
    findByPublicId.mockResolvedValue({ id: 'product-1', status: 'PUBLISHED' });
    findAssetById.mockResolvedValue({
      id: 'asset-1',
      productId: 'product-1',
      status: 'PUBLISHED',
      displayName: 'Datasheet',
      contentType: 'application/pdf',
      storageKey: 'internal-key-should-never-leak',
    });
    createSignedDownloadUrl.mockResolvedValue('https://storage.example/signed?sig=abc');

    const response = await GET(
      new NextRequest('https://example.test/api/catalog/products/P8K4F2M9/assets/asset-1/download'),
      context('P8K4F2M9', 'asset-1'),
    );

    // NextResponse.redirect()'s own default — verified against the
    // installed next@16.2.12 package source
    // (docs/runbooks/http-error-contract.md).
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example/signed?sig=abc');
    expect(createSignedDownloadUrl).toHaveBeenCalledWith(
      'internal-key-should-never-leak',
      300,
      'Datasheet.pdf',
    );
  });

  it('returns 404 for an unknown product, never confirming or denying via a different status', async () => {
    findByPublicId.mockResolvedValue(undefined);

    const response = await GET(
      new NextRequest(
        'https://example.test/api/catalog/products/UNKNOWN01/assets/asset-1/download',
      ),
      context('UNKNOWN01', 'asset-1'),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('returns the same 404 for an unauthenticated request to a DRAFT asset (anti-enumeration policy, docs/runbooks/http-error-contract.md)', async () => {
    findByPublicId.mockResolvedValue({ id: 'product-1', status: 'PUBLISHED' });
    findAssetById.mockResolvedValue({
      id: 'asset-1',
      productId: 'product-1',
      status: 'DRAFT',
      displayName: 'Draft asset',
      contentType: 'application/pdf',
      storageKey: 'internal-key',
    });

    const response = await GET(
      new NextRequest('https://example.test/api/catalog/products/P8K4F2M9/assets/asset-1/download'),
      context('P8K4F2M9', 'asset-1'),
    );

    expect(response.status).toBe(404);
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
  });
});
