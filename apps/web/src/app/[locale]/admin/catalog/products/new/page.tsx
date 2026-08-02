import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';
import { CreateProductForm } from './create-product-form';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
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
  // Category picker, not a list screen — see the identical comment in
  // admin/catalog/categories/new/page.tsx.
  const { items: categories } = await container.categories.listAll({ limit: 200 });

  return (
    <main>
      <h1>New product</h1>
      <CreateProductForm
        categoryOptions={categories.map((category) => ({
          id: category.id,
          name:
            category.translations.find((t) => t.locale === 'en')?.name ??
            category.translations[0]?.name ??
            category.id,
        }))}
      />
    </main>
  );
}
