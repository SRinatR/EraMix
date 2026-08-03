import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { getIndexNowDiagnostics, hasPermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const ENGINE_LABELS: Record<string, string> = {
  bing: 'Bing',
  yandex: 'Yandex',
};

/**
 * Admin health/history view for the IndexNow adapter (CLAUDE.md: "P1,
 * secret-managed notification adapter for Bing/Yandex only... dead-letter/
 * error visibility... admin health/history view... emergency disable
 * behavior"). Read-only — enablement is controlled on `/admin/settings`;
 * this page never writes anything and never shows the real key, only
 * whether one is configured.
 */
export default async function AdminIndexNowDiagnosticsPage() {
  const actor = await getServerActor();
  if (!actor || !hasPermission(actor.platformRole, 'settings.manage')) {
    notFound();
  }

  const container = getContainer();
  const diagnostics = await getIndexNowDiagnostics(
    { settingsRepo: container.settingsRepo, engineStatusRepo: container.indexNowEngineStatus },
    actor.platformRole,
    container.env.INDEXNOW_KEY !== undefined,
  );

  return (
    <main>
      <h1>IndexNow diagnostics</h1>
      <p>
        IndexNow notifies Bing and Yandex only, after a successful publish — it is never a Google
        indexing mechanism and never replaces sitemap/canonical correctness. Enablement is
        controlled on <a href="/admin/settings">Settings</a>.
      </p>
      <dl>
        <dt>Admin-enabled (indexNowEnabled)</dt>
        <dd>{diagnostics.indexNowEnabled ? 'Yes' : 'No'}</dd>
        <dt>Emergency sitewide noindex</dt>
        <dd>{diagnostics.crawlerGlobalNoindex ? 'On — suppresses IndexNow too' : 'Off'}</dd>
        <dt>Deployment key configured</dt>
        <dd>{diagnostics.keyConfigured ? 'Yes' : 'No'}</dd>
        <dt>Effectively active right now</dt>
        <dd>{diagnostics.effectivelyActive ? 'Yes' : 'No'}</dd>
      </dl>
      <table>
        <thead>
          <tr>
            <th>Engine</th>
            <th>Last attempt</th>
            <th>Last result</th>
            <th>URLs submitted</th>
          </tr>
        </thead>
        <tbody>
          {diagnostics.engines.length === 0 ? (
            <tr>
              <td colSpan={4}>No submission has ever been attempted.</td>
            </tr>
          ) : (
            diagnostics.engines.map((engine) => (
              <tr key={engine.engine}>
                <td>{ENGINE_LABELS[engine.engine] ?? engine.engine}</td>
                <td>{engine.lastAttemptAt}</td>
                <td>
                  {engine.lastSucceeded
                    ? `Succeeded (HTTP ${engine.lastStatusCode ?? '?'})`
                    : `Failed${engine.lastError ? `: ${engine.lastError}` : ''}`}
                </td>
                <td>{engine.lastUrlCount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
