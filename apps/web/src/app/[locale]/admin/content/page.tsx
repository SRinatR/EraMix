import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { TransitionStatusForm } from '../catalog/transition-status-form';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function firstTranslationTitle(translations: readonly { locale: string; title: string }[]): string {
  return (
    translations.find((translation) => translation.locale === 'en')?.title ??
    translations[0]?.title ??
    '(no translation)'
  );
}

export default async function AdminContentPage() {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'content.write');
  } catch {
    notFound();
  }

  const container = getContainer();
  const items = await container.content.listAll();

  return (
    <main>
      <h1>Content</h1>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Title</th>
            <th>Status</th>
            <th>Change status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.type}</td>
              <td>{firstTranslationTitle(item.translations)}</td>
              <td>{item.status}</td>
              <td>
                <TransitionStatusForm
                  endpoint={`/api/admin/content/${item.id}/status`}
                  currentStatus={item.status}
                  expectedVersion={item.version}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
