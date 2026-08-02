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
import { RetireForm } from './retire-form';
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

  const categoriesPagination = parsePaginationParams(resolvedSearchParams, 'categories');
  const productsPagination = parsePaginationParams(resolvedSearchParams, 'products');
  const [categoryPage, productPage] = await Promise.all([
    container.categories.listAll({
      ...categoriesPagination,
      ...(categorySearch !== undefined ? { search: categorySearch } : {}),
      ...(categoryStatus !== undefined ? { status: categoryStatus } : {}),
      ...(categorySort !== undefined ? { sort: categorySort } : {}),
    }),
    container.products.listAll({
      ...productsPagination,
      ...(productSearch !== undefined ? { search: productSearch } : {}),
      ...(productStatus !== undefined ? { status: productStatus } : {}),
      ...(productSort !== undefined ? { sort: productSort } : {}),
    }),
  ]);
  const { data: categories, page: categoryPageInfo } = categoryPage;
  const { data: products, page: productPageInfo } = productPage;
  const categoryExtraParams = {
    ...(categorySearch !== undefined ? { categoriesSearch: categorySearch } : {}),
    ...(categoryStatus !== undefined ? { categoriesStatus: categoryStatus } : {}),
    ...(categorySort !== undefined ? { categoriesSort: categorySort } : {}),
    ...(productsPagination.cursor !== undefined
      ? { productsCursor: productsPagination.cursor }
      : {}),
    ...(productSearch !== undefined ? { productsSearch: productSearch } : {}),
    ...(productStatus !== undefined ? { productsStatus: productStatus } : {}),
    ...(productSort !== undefined ? { productsSort: productSort } : {}),
  };
  const productExtraParams = {
    ...(productSearch !== undefined ? { productsSearch: productSearch } : {}),
    ...(productStatus !== undefined ? { productsStatus: productStatus } : {}),
    ...(productSort !== undefined ? { productsSort: productSort } : {}),
    ...(categoriesPagination.cursor !== undefined
      ? { categoriesCursor: categoriesPagination.cursor }
      : {}),
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
        {productsPagination.cursor !== undefined && (
          <input type="hidden" name="productsCursor" value={productsPagination.cursor} />
        )}
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
            <th>Retire</th>
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
                {category.retiredAt !== undefined ? (
                  <span>Retired: {category.retirementReason}</span>
                ) : category.status === 'ARCHIVED' ? (
                  <RetireForm
                    endpoint={`/api/admin/categories/${category.id}/retire`}
                    expectedVersion={category.version}
                  />
                ) : (
                  '—'
                )}
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
        page={categoryPageInfo}
        currentCursor={categoriesPagination.cursor}
        cursorParamName="categoriesCursor"
        extraParams={categoryExtraParams}
      />

      <h2>
        Products <Link href="/admin/catalog/products/new">New product</Link>
      </h2>
      <form method="get">
        {categoriesPagination.cursor !== undefined && (
          <input type="hidden" name="categoriesCursor" value={categoriesPagination.cursor} />
        )}
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
            <th>Retire</th>
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
                {product.retiredAt !== undefined ? (
                  <span>Retired: {product.retirementReason}</span>
                ) : product.status === 'ARCHIVED' ? (
                  <RetireForm
                    endpoint={`/api/admin/products/${product.id}/retire`}
                    expectedVersion={product.version}
                  />
                ) : (
                  '—'
                )}
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
        page={productPageInfo}
        currentCursor={productsPagination.cursor}
        cursorParamName="productsCursor"
        extraParams={productExtraParams}
      />
    </main>
  );
}
