import { getContainer } from '@/server/container';
import { productAlternates, categoryAlternates } from '@/server/seo';
import { resolveCategoryRoute, resolveProductRoute } from '@eramix/application';
import {
  isSupportedLocale,
  isValidPublicId,
  PUBLIC_ID_LENGTH,
  type LocaleCode,
} from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
export const dynamic = 'force-dynamic';

interface PageParams {
  locale: string;
  slug: string;
}

/** Product URLs are `{publicId}-{slug}` (ADR-0010); category URLs are plain `{slug}`. */
function splitProductSlug(slug: string): { publicId: string; rest: string } | undefined {
  if (slug.length <= PUBLIC_ID_LENGTH || slug[PUBLIC_ID_LENGTH] !== '-') {
    return undefined;
  }
  const publicId = slug.slice(0, PUBLIC_ID_LENGTH);
  if (!isValidPublicId(publicId)) {
    return undefined;
  }
  return { publicId, rest: slug.slice(PUBLIC_ID_LENGTH + 1) };
}

async function resolve(locale: LocaleCode, slug: string) {
  const container = getContainer();
  const asProduct = splitProductSlug(slug);
  if (asProduct) {
    const resolution = await resolveProductRoute(
      container.products,
      asProduct.publicId,
      locale,
      asProduct.rest,
    );
    return { kind: 'product' as const, resolution };
  }
  const resolution = await resolveCategoryRoute(container.categories, locale, slug);
  return { kind: 'category' as const, resolution };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    return {};
  }
  const resolved = await resolve(locale, slug);
  if (resolved.resolution.kind !== 'canonical') {
    return {};
  }
  return resolved.kind === 'product'
    ? productAlternates(locale, resolved.resolution.product)
    : categoryAlternates(locale, resolved.resolution.category);
}

export default async function CatalogEntryPage({ params }: { params: Promise<PageParams> }) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const resolved = await resolve(locale, slug);
  if (resolved.resolution.kind === 'not-found') {
    notFound();
  }
  if (resolved.resolution.kind === 'redirect') {
    permanentRedirect(resolved.resolution.canonicalUrl);
  }

  if (resolved.kind === 'product') {
    const { product, translation } = resolved.resolution;
    const container = getContainer();
    const assets = await container.productAssets.listPublishedByProduct(product.id);
    const images = assets.filter((asset) => asset.assetType === 'IMAGE');
    const documents = assets.filter((asset) => asset.assetType === 'DOCUMENT');
    const downloadUrl = (assetId: string) =>
      `/api/catalog/products/${product.publicId}/assets/${assetId}/download`;

    return (
      <main>
        <h1>{translation.name}</h1>
        <p>SKU: {product.sku}</p>
        {translation.description && <p>{translation.description}</p>}
        {translation.indicativePrice && (
          <p>
            {translation.indicativePrice.priceDisclaimer ?? 'from'}{' '}
            {(translation.indicativePrice.priceFromMinor / 100).toFixed(2)}{' '}
            {translation.indicativePrice.currency}
          </p>
        )}
        {images.length > 0 && (
          <section aria-label="Product images">
            {images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element -- dev-only local storage provider; a real CDN-backed provider would use next/image (ADR-0006 pending)
              <img key={image.id} src={downloadUrl(image.id)} alt={image.altText ?? ''} />
            ))}
          </section>
        )}
        {documents.length > 0 && (
          <section aria-label="Product documents">
            <h2>Documents</h2>
            <ul>
              {documents.map((document) => (
                <li key={document.id}>
                  <a href={downloadUrl(document.id)}>{document.displayName}</a>
                  {document.caption && <p>{document.caption}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    );
  }

  const { category, translation } = resolved.resolution;
  return (
    <main>
      <h1>{translation.name}</h1>
      <p>Category id: {category.id}</p>
    </main>
  );
}
