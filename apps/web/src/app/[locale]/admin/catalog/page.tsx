import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
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

      <h2>Categories</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Change status</th>
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
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Products</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Status</th>
            <th>Change status</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
