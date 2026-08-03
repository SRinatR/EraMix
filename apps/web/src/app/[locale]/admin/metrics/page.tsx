import { getServerActor } from '@/server/session';
import { getMetricDictionary, hasPermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Admin view of the governed cross-platform metric dictionary (CLAUDE.md:
 * "Build a governed comparison layer... It defines metric meaning,
 * attribution window, timezone, currency, consent/sampling coverage,
 * freshness and reconciliation rules"). This lists the governance
 * definitions only — there is no live cross-source data ingestion in this
 * codebase yet (no GA4 Reporting/Search Console/Yandex Webmaster/Rust-
 * analytics/ad-platform reporting credential exists), so this page never
 * shows a number claiming to be real traffic/spend/conversion data. The
 * normalized side-by-side comparison itself is available at
 * `POST /api/admin/metrics/compare` for a caller that already holds
 * source-native measurements.
 */
export default async function AdminMetricsPage() {
  const actor = await getServerActor();
  if (!actor || !hasPermission(actor.platformRole, 'settings.manage')) {
    notFound();
  }

  const dictionary = getMetricDictionary(actor.platformRole);

  return (
    <main>
      <h1>Cross-platform metric dictionary</h1>
      <p>
        Governance definitions for every metric the comparison layer knows about — meaning, unit,
        applicable sources, attribution window, timezone, currency, consent category, sampling, and
        reconciliation rules. No source is ever silently merged into another; discrepancies between
        comparable sources are shown side by side via <code>POST /api/admin/metrics/compare</code>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Meaning</th>
            <th>Unit</th>
            <th>Applicable sources</th>
            <th>Attribution window</th>
            <th>Currency</th>
            <th>Consent category</th>
            <th>Sampling</th>
            <th>Freshness SLA</th>
            <th>Reconciliation note</th>
          </tr>
        </thead>
        <tbody>
          {dictionary.map((definition) => (
            <tr key={definition.metricId}>
              <td>{definition.displayName}</td>
              <td>{definition.meaning}</td>
              <td>{definition.unit}</td>
              <td>{definition.applicableSources.join(', ')}</td>
              <td>
                {definition.attributionWindowDays ? `${definition.attributionWindowDays}d` : '—'}
              </td>
              <td>{definition.currency ?? '—'}</td>
              <td>{definition.consentCategoryRequired ?? 'None'}</td>
              <td>{definition.samplingNote}</td>
              <td>{definition.freshnessSlaHours}h</td>
              <td>{definition.reconciliationNote}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
