import { Link } from '@/i18n/navigation';
import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import {
  parseAllowlistedParam,
  parsePaginationParams,
  parseStringParam,
} from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { AddTranslationForm } from './add-translation-form';
import { ChangeSlugForm } from './change-slug-form';
import { EditCategoryTranslationForm } from './edit-category-translation-form';
import { EditProductTranslationForm } from './edit-product-translation-form';
import { TransitionStatusForm } from './transition-status-form';
import { requirePermission } from '@eramix/application';
import type { PublicationStatus } from '@eramix/domain';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const STATUSES: readonly PublicationStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const CATEGORY_SORTS = [
  'sortOrder_asc',
  'sortOrder_desc',
  'createdAt_asc',
  'createdAt_desc',
] as const;
const PRODUCT_SORTS = ['createdAt_asc', 'createdAt_desc', 'sku_asc', 'sku_desc'] as const;

function firstTranslationName(translations: readonly { locale: string; name: string }[]): string {
  return (
    translations.find((translation) => translation.locale === 'en')?.name ??
    translations[0]?.name ??
    '(no translation)'
  );
}

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const container = getContainer();
  const resolvedSearchParams = await searchParams;
  const categorySearch = parseStringParam(resolvedSearchParams, 'search', 'categories');
  const categoryStatus = parseAllowlistedParam(
    resolvedSearchParams,
    'status',
    STATUSES,
    'categories',
  );
  const categorySort = parseAllowlistedParam(
    resolvedSearchParams,
    'sort',
    CATEGORY_SORTS,
    'categories',
  );
  const productSearch = parseStringParam(resolvedSearchParams, 'search', 'products');
  const productStatus = parseAllowlistedParam(resolvedSearchParams, 'status', STATUSES, 'products');
  const productSort = parseAllowlistedParam(
    resolvedSearchParams,
    'sort',
    PRODUCT_SORTS,
    'products',
  );

  const [categoryPage, productPage] = await Promise.all([
    container.categories.listAll({
      ...parsePaginationParams(resolvedSearchParams, 'categories'),
      ...(categorySearch !== undefined ? { search: categorySearch } : {}),
      ...(categoryStatus !== undefined ? { status: categoryStatus } : {}),
      ...(categorySort !== undefined ? { sort: categorySort } : {}),
    }),
    container.products.listAll({
      ...parsePaginationParams(resolvedSearchParams, 'products'),
      ...(productSearch !== undefined ? { search: productSearch } : {}),
      ...(productStatus !== undefined ? { status: productStatus } : {}),
      ...(productSort !== undefined ? { sort: productSort } : {}),
    }),
  ]);
  const { items: categories } = categoryPage;
  const { items: products } = productPage;
  const categoryExtraParams = {
    productsLimit: String(productPage.limit),
    productsOffset: String(productPage.offset),
    ...(productSearch !== undefined ? { productsSearch: productSearch } : {}),
    ...(productStatus !== undefined ? { productsStatus: productStatus } : {}),
    ...(productSort !== undefined ? { productsSort: productSort } : {}),
  };
  const productExtraParams = {
    categoriesLimit: String(categoryPage.limit),
    categoriesOffset: String(categoryPage.offset),
    ...(categorySearch !== undefined ? { categoriesSearch: categorySearch } : {}),
    ...(categoryStatus !== undefined ? { categoriesStatus: categoryStatus } : {}),
    ...(categorySort !== undefined ? { categoriesSort: categorySort } : {}),
  };

  return (
    <main>
      <h1>Catalog</h1>

      <h2>
        Categories <Link href="/admin/catalog/categories/new">New category</Link>
      </h2>
      <form method="get">
        <input type="hidden" name="productsLimit" value={productPage.limit} />
        <input type="hidden" name="productsOffset" value={productPage.offset} />
        <label>
          Search
          <input type="search" name="categoriesSearch" defaultValue={categorySearch ?? ''} />
        </label>
        <label>
          Status
          <select name="categoriesStatus" defaultValue={categoryStatus ?? ''}>
            <option value="">All</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select name="categoriesSort" defaultValue={categorySort ?? 'sortOrder_asc'}>
            {CATEGORY_SORTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Change status</th>
            <th>Add translation</th>
            <th>Edit translations</th>
            <th>Slugs</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              <td>{firstTranslationName(category.translations)}</td>
              <td>{category.status}</td>
              <td>
                <TransitionStatusForm
                  endpoint={`/api/admin/categories/${category.id}/status`}
                  currentStatus={category.status}
                  expectedVersion={category.version}
                />
              </td>
              <td>
                <AddTranslationForm
                  endpoint={`/api/admin/categories/${category.id}/translations`}
                  existingLocales={category.translations.map((t) => t.locale)}
                  requireSlug={false}
                />
              </td>
              <td>
                {category.translations.map((translation) => (
                  <div key={translation.id}>
                    {translation.locale}:{' '}
                    <EditCategoryTranslationForm
                      endpoint={`/api/admin/categories/${category.id}/translations/${translation.id}`}
                      expectedVersion={translation.version}
                      initialName={translation.name}
                      initialSeoTitle={translation.seoTitle}
                      initialSeoDescription={translation.seoDescription}
                    />
                  </div>
                ))}
              </td>
              <td>
                {category.translations.map((translation) => (
                  <div key={translation.id}>
                    {translation.locale}:{' '}
                    <ChangeSlugForm
                      endpoint={`/api/admin/categories/${category.id}/translations/${translation.id}/slug`}
                      currentSlug={translation.routes.find((route) => route.isCanonical)?.slug}
                      extraBody={{ locale: translation.locale }}
                    />
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls
        basePath="/admin/catalog"
        total={categoryPage.total}
        limit={categoryPage.limit}
        offset={categoryPage.offset}
        limitParamName="categoriesLimit"
        offsetParamName="categoriesOffset"
        extraParams={categoryExtraParams}
      />

      <h2>
        Products <Link href="/admin/catalog/products/new">New product</Link>
      </h2>
      <form method="get">
        <input type="hidden" name="categoriesLimit" value={categoryPage.limit} />
        <input type="hidden" name="categoriesOffset" value={categoryPage.offset} />
        <label>
          Search
          <input type="search" name="productsSearch" defaultValue={productSearch ?? ''} />
        </label>
        <label>
          Status
          <select name="productsStatus" defaultValue={productStatus ?? ''}>
            <option value="">All</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select name="productsSort" defaultValue={productSort ?? 'createdAt_desc'}>
            {PRODUCT_SORTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Status</th>
            <th>Change status</th>
            <th>Add translation</th>
            <th>Edit translations</th>
            <th>Media</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.sku}</td>
              <td>{firstTranslationName(product.translations)}</td>
              <td>{product.status}</td>
              <td>
                <TransitionStatusForm
                  endpoint={`/api/admin/products/${product.id}/status`}
                  currentStatus={product.status}
                  expectedVersion={product.version}
                />
              </td>
              <td>
                <AddTranslationForm
                  endpoint={`/api/admin/products/${product.id}/translations`}
                  existingLocales={product.translations.map((t) => t.locale)}
                  requireSlug={true}
                />
              </td>
              <td>
                {product.translations.map((translation) => (
                  <div key={translation.id}>
                    {translation.locale}:{' '}
                    <EditProductTranslationForm
                      endpoint={`/api/admin/products/${product.id}/translations/${translation.id}`}
                      expectedVersion={translation.version}
                      initialName={translation.name}
                      initialDescription={translation.description}
                      initialSeoTitle={translation.seoTitle}
                      initialSeoDescription={translation.seoDescription}
                      initialPriceFromMinor={translation.indicativePrice?.priceFromMinor}
                      initialCurrency={translation.indicativePrice?.currency}
                      initialPriceDisclaimer={translation.indicativePrice?.priceDisclaimer}
                    />
                  </div>
                ))}
              </td>
              <td>
                <Link href={`/admin/catalog/products/${product.id}/assets`}>Manage media</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls
        basePath="/admin/catalog"
        total={productPage.total}
        limit={productPage.limit}
        offset={productPage.offset}
        limitParamName="productsLimit"
        offsetParamName="productsOffset"
        extraParams={productExtraParams}
      />
    </main>
  );
}
