import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';
import { AssetRow } from './asset-row';
import { UploadAssetForm } from './upload-asset-form';

export const dynamic = 'force-dynamic';

function firstTranslationName(translations: readonly { locale: string; name: string }[]): string {
  return (
    translations.find((translation) => translation.locale === 'en')?.name ??
    translations[0]?.name ??
    '(no translation)'
  );
}

export default async function ProductAssetsPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'catalog.write');
  } catch {
    notFound();
  }

  const { productId } = await params;
  const container = getContainer();
  const [product, assets] = await Promise.all([
    container.products.findById(productId),
    container.productAssets.listByProduct(productId),
  ]);
  if (!product) {
    notFound();
  }

  const orderedIds = assets.map((asset) => asset.id);

  return (
    <main>
      <h1>Media — {firstTranslationName(product.translations)}</h1>
      <p>SKU: {product.sku}</p>

      <h2>Upload</h2>
      <UploadAssetForm productId={productId} />

      <h2>Assets</h2>
      {assets.length === 0 ? (
        <p>No images or documents uploaded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Preview</th>
              <th>Type</th>
              <th>Status</th>
              <th>Details</th>
              <th>Order</th>
              <th>Edit metadata</th>
              <th>Change status</th>
              <th>Remove</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset, index) => (
              <AssetRow
                key={asset.id}
                productId={productId}
                asset={asset}
                downloadUrl={`/api/catalog/products/${product.publicId}/assets/${asset.id}/download`}
                orderedIds={orderedIds}
                index={index}
              />
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
