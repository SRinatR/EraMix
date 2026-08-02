import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';
import { CreateCategoryForm } from './create-category-form';

export const dynamic = 'force-dynamic';

export default async function NewCategoryPage() {
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
  // A parent-category picker, not a "list" screen — bounded at a generous
  // limit rather than paginated (ADM-002/DB-005's pagination requirement
  // targets list views, not option pickers); category counts are structural
  // catalog taxonomy, not the 100k-product-scale data DB-005's load profile
  // names.
  const { items: categories } = await container.categories.listAll({ limit: 200 });

  return (
    <main>
      <h1>New category</h1>
      <CreateCategoryForm
        parentOptions={categories.map((category) => ({
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
