import { AnalyticsEventTracker } from '@/components/analytics-event-tracker';
import { formatIndicativePrice } from '@/components/indicative-price';
import { JsonLd } from '@/components/json-ld';
import { PaginationControls } from '@/components/pagination-controls';
import { Link } from '@/i18n/navigation';
import { getContainer } from '@/server/container';
import { parsePaginationParams, parseStringParam } from '@/server/pagination';
import { productAlternates, categoryAlternates } from '@/server/seo';
import {
  listCatalogCategories,
  listCatalogProducts,
  resolveCategoryRoute,
  resolveProductRoute,
} from '@eramix/application';
import { isSupportedLocale, splitCatalogSlug, type LocaleCode } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';

// DB-backed; must not be statically prerendered at build time (no live DB then).
export const dynamic = 'force-dynamic';

interface PageParams {
  locale: string;
  slug: string;
}

async function resolve(locale: LocaleCode, slug: string) {
  const container = getContainer();
  const asProduct = splitCatalogSlug(slug);
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
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    return {};
  }
  const resolved = await resolve(locale, slug);
  if (resolved.resolution.kind !== 'canonical') {
    return {};
  }
  if (resolved.kind === 'product') {
    return productAlternates(locale, resolved.resolution.product);
  }
  const resolvedSearchParams = await searchParams;
  const search = parseStringParam(resolvedSearchParams, 'search');
  const pagination = parsePaginationParams(resolvedSearchParams);
  return categoryAlternates(locale, resolved.resolution.category, { search, pagination });
}

export default async function CatalogEntryPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const resolved = await resolve(locale, slug);
  if (resolved.resolution.kind === 'not-found' || resolved.resolution.kind === 'retired') {
    // A real HTTP 410 for the 'retired' case is served by src/proxy.ts before
    // this page ever renders (page.tsx/Server Components cannot set a
    // custom status code — see ADR-0018). This is defense-in-depth only.
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
        <AnalyticsEventTracker
          locale={locale}
          fields={{ eventName: 'view_item', productPublicId: product.publicId }}
        />
        {/* schema.org Product — deliberately no "offers"/price: ADR-0005's
            quote-only model means indicativePrice is explicitly non-binding,
            and an Offer/price in structured data risks a search engine
            treating it as a real, transactable price. */}
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: translation.name,
            sku: product.sku,
            ...(translation.description !== undefined
              ? { description: translation.description }
              : {}),
          }}
        />
        <h1>{translation.name}</h1>
        <p>SKU: {product.sku}</p>
        {translation.description && <p>{translation.description}</p>}
        {translation.indicativePrice && <p>{formatIndicativePrice(translation.indicativePrice)}</p>}
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
  const container = getContainer();
  const resolvedSearchParams = await searchParams;
  const searchParam =
    typeof resolvedSearchParams['search'] === 'string' ? resolvedSearchParams['search'] : undefined;

  const pagination = parsePaginationParams(resolvedSearchParams);
  const [subcategories, productPage] = await Promise.all([
    listCatalogCategories(container.categories, category.id),
    listCatalogProducts(container.products, {
      categoryId: category.id,
      ...(searchParam !== undefined ? { search: searchParam } : {}),
      ...pagination,
    }),
  ]);

  return (
    <main>
      <AnalyticsEventTracker
        locale={locale}
        fields={{
          eventName: 'view_item_list',
          categoryId: category.id,
          resultCount: productPage.data.length,
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: translation.name,
        }}
      />
      <h1>{translation.name}</h1>

      {subcategories.length > 0 && (
        <>
          <h2>Subcategories</h2>
          <ul>
            {subcategories.map((subcategory) => {
              const subTranslation = subcategory.translations.find((t) => t.locale === locale);
              const canonicalRoute = subTranslation?.routes.find((route) => route.isCanonical);
              if (!subTranslation || !canonicalRoute) {
                return null;
              }
              return (
                <li key={subcategory.id}>
                  <Link href={`/catalog/${canonicalRoute.slug}`}>{subTranslation.name}</Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2>Products</h2>
      {/* CAT-002: search by name/SKU/indexable description within this category. */}
      <form method="get">
        <label>
          Search
          <input type="search" name="search" defaultValue={searchParam ?? ''} />
        </label>
        <button type="submit">Search</button>
      </form>
      {productPage.data.length === 0 ? (
        <p>No products match this search.</p>
      ) : (
        <ul>
          {productPage.data.map((product) => {
            const productTranslation = product.translations.find((t) => t.locale === locale);
            if (!productTranslation) {
              return null;
            }
            return (
              <li key={product.id}>
                <Link href={`/catalog/${product.publicId}-${productTranslation.slug}`}>
                  {productTranslation.name}
                </Link>{' '}
                (SKU: {product.sku})
                {productTranslation.indicativePrice && (
                  <> — {formatIndicativePrice(productTranslation.indicativePrice)}</>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <PaginationControls
        basePath={`/catalog/${slug}`}
        page={productPage.page}
        currentCursor={pagination.cursor}
        extraParams={searchParam !== undefined ? { search: searchParam } : {}}
      />
    </main>
  );
}
