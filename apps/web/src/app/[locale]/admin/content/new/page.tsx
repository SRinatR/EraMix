import { getServerActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';
import { CreateContentForm } from './create-content-form';

export const dynamic = 'force-dynamic';

export default async function NewContentPage() {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'content.write');
  } catch {
    notFound();
  }

  return (
    <main>
      <h1>New content item</h1>
      <CreateContentForm />
    </main>
  );
}
