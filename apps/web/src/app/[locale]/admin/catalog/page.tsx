import { Link } from '@/i18n/navigation';
import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { AddTranslationForm } from './add-translation-form';
import { ChangeSlugForm } from './change-slug-form';
import { EditCategoryTranslationForm } from './edit-category-translation-form';
import { EditProductTranslationForm } from './edit-product-translation-form';
import { TransitionStatusForm } from './transition-status-form';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function firstTranslationName(translations: readonly { locale: string; name: string }[]): string {
  return (
    translations.find((translation) => translation.locale === 'en')?.name ??
    translations[0]?.name ??
    '(no translation)'
  );
}

export default async function AdminCatalogPage() {
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
  const [categories, products] = await Promise.all([
    container.categories.listAll(),
    container.products.listAll(),
  ]);

  return (
    <main>
      <h1>Catalog</h1>

      <h2>
        Categories <Link href="/admin/catalog/categories/new">New category</Link>
      </h2>
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

      <h2>
        Products <Link href="/admin/catalog/products/new">New product</Link>
      </h2>
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
    </main>
  );
}
