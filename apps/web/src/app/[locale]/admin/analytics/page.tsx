import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { getAnalyticsDiagnostics, hasPermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const SINK_LABELS: Record<string, string> = {
  ga4: 'Google Analytics 4',
  yandex_metrica: 'Yandex Metrica',
  rust_analytics: 'Rust analytics (first-party, not yet available)',
};

/**
 * Admin diagnostics for the 3 analytics sinks (CLAUDE.md: "Provide admin
 * diagnostics showing enabled state, configuration validity and last safe
 * delivery result and redacted error state, without exposing secrets or
 * PII"). Read-only — enablement/measurement-ID changes happen on
 * `/admin/settings`, this page never writes anything.
 */
export default async function AdminAnalyticsDiagnosticsPage() {
  const actor = await getServerActor();
  if (!actor || !hasPermission(actor.platformRole, 'settings.manage')) {
    notFound();
  }

  const container = getContainer();
  const diagnostics = await getAnalyticsDiagnostics(
    { settingsRepo: container.settingsRepo, sinkStatusRepo: container.analyticsSinkStatus },
    actor.platformRole,
  );

  return (
    <main>
      <h1>Analytics diagnostics</h1>
      <p>
        Enabled state and measurement-ID configuration validity are controlled on{' '}
        <a href="/admin/settings">Settings</a>. This page only shows the last safe delivery result
        per sink — never a secret (the GA4 API secret is a deployment-only credential, never stored
        or shown here).
      </p>
      <table>
        <thead>
          <tr>
            <th>Sink</th>
            <th>Enabled</th>
            <th>Configuration</th>
            <th>Last attempt</th>
            <th>Last result</th>
          </tr>
        </thead>
        <tbody>
          {diagnostics.map((diagnostic) => (
            <tr key={diagnostic.sink}>
              <td>{SINK_LABELS[diagnostic.sink] ?? diagnostic.sink}</td>
              <td>{diagnostic.enabled ? 'Enabled' : 'Disabled'}</td>
              <td>{diagnostic.configValid ? 'Valid' : 'Missing required ID'}</td>
              <td>{diagnostic.lastAttemptAt ?? 'Never attempted'}</td>
              <td>
                {diagnostic.lastAttemptAt === undefined
                  ? '—'
                  : diagnostic.lastSkipped
                    ? 'Skipped (consent or admin enablement absent)'
                    : diagnostic.lastSucceeded
                      ? 'Succeeded'
                      : `Failed${diagnostic.lastError ? `: ${diagnostic.lastError}` : ''}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
