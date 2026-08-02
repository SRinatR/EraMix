import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import {
  getPlatformSettings,
  hasPermission,
  listPlatformSettingsHistory,
} from '@eramix/application';
import { notFound } from 'next/navigation';
import { RollbackButton } from './rollback-button';
import { SettingsForm, type SettingsFormValues } from './settings-form';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const actor = await getServerActor();
  if (!actor || !hasPermission(actor.platformRole, 'settings.manage')) {
    notFound();
  }

  const container = getContainer();
  const settings = await getPlatformSettings({ settingsRepo: container.settingsRepo });
  const history = await listPlatformSettingsHistory(
    { historyRepo: container.settingsHistoryRepo },
    { limit: 20 },
  );

  const initial: SettingsFormValues = {
    canonicalHost: settings.canonicalHost,
    forceHttps: settings.forceHttps,
    stripTrailingSlash: settings.stripTrailingSlash,
    organizationName: settings.organizationName ?? null,
    organizationLegalName: settings.organizationLegalName ?? null,
    organizationEmail: settings.organizationEmail ?? null,
    organizationPhone: settings.organizationPhone ?? null,
    organizationAddress: settings.organizationAddress ?? null,
    organizationSameAs: settings.organizationSameAs ?? null,
    seoDefaultTitleTemplate: settings.seoDefaultTitleTemplate ?? null,
    seoDefaultDescriptionFallback: settings.seoDefaultDescriptionFallback ?? null,
    ogFallbackImageUrl: settings.ogFallbackImageUrl ?? null,
    crawlerGlobalNoindex: settings.crawlerGlobalNoindex,
    googleExtendedAllowed: settings.googleExtendedAllowed,
    aiCompatibilityFilesEnabled: settings.aiCompatibilityFilesEnabled,
    analyticsConsentRequired: settings.analyticsConsentRequired,
    ga4Enabled: settings.ga4Enabled,
    ga4MeasurementId: settings.ga4MeasurementId ?? null,
    yandexMetricaEnabled: settings.yandexMetricaEnabled,
    yandexMetricaCounterId: settings.yandexMetricaCounterId ?? null,
    rustAnalyticsEnabled: settings.rustAnalyticsEnabled,
    searchConsoleVerificationToken: settings.searchConsoleVerificationToken ?? null,
    yandexWebmasterVerificationToken: settings.yandexWebmasterVerificationToken ?? null,
    bingVerificationToken: settings.bingVerificationToken ?? null,
    indexNowEnabled: settings.indexNowEnabled,
    merchantCenterEnabled: settings.merchantCenterEnabled,
  };

  return (
    <main>
      <h1>Platform settings</h1>
      <p>
        Version {settings.version} — last updated {settings.updatedAt.toISOString()}
      </p>
      <SettingsForm initial={initial} expectedVersion={settings.version} />

      <h2>Change history</h2>
      {history.data.length === 0 ? (
        <p>No changes recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Changed by</th>
              <th>Reason</th>
              <th>Canonical host before this change</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.data.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.createdAt.toISOString()}</td>
                <td>{entry.changedByUserId ?? '(system)'}</td>
                <td>{entry.changeReason ?? ''}</td>
                <td>{entry.previousSnapshot.canonicalHost}</td>
                <td>
                  <RollbackButton
                    historyEntryId={entry.id}
                    expectedVersion={settings.version}
                    previousCanonicalHost={entry.previousSnapshot.canonicalHost}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
