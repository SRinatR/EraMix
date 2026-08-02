import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { hasPermission, listAdvertisingProviderConfigs } from '@eramix/application';
import { notFound } from 'next/navigation';
import { ProviderConfigForm } from './provider-config-form';

export const dynamic = 'force-dynamic';

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  YANDEX_DIRECT: 'Yandex Direct',
  MICROSOFT_ADS: 'Microsoft Ads',
  META: 'Meta',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
};

/**
 * ADM-001-style admin page (CLAUDE.md: advertising-integration control
 * plane). Configuration/enablement only — conversion mapping, attribution/
 * UTM rules, and server-side conversion dispatch are a later slice that
 * depends on the GA4/Yandex Metrica event registry.
 */
export default async function AdminAdvertisingPage() {
  const actor = await getServerActor();
  if (!actor || !hasPermission(actor.platformRole, 'settings.manage')) {
    notFound();
  }

  const container = getContainer();
  const configs = await listAdvertisingProviderConfigs(
    { repo: container.advertisingProviders },
    actor.platformRole,
  );

  return (
    <main>
      <h1>Advertising integrations</h1>
      <p>
        Provider enablement, consent category, and non-secret account/container/pixel identifiers.
        Credentials are never entered here — only a reference to where the real value lives in the
        deployment secret store.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Status</th>
            <th>Configuration</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((config) => (
            <tr key={config.provider}>
              <td>{PROVIDER_LABELS[config.provider] ?? config.provider}</td>
              <td>{config.enabled ? 'Enabled' : 'Disabled'}</td>
              <td>
                <ProviderConfigForm
                  initial={{
                    provider: config.provider,
                    enabled: config.enabled,
                    consentCategory: config.consentCategory,
                    accountId: config.accountId ?? null,
                    containerId: config.containerId ?? null,
                    pixelId: config.pixelId ?? null,
                    credentialSecretRef: config.credentialSecretRef ?? null,
                    testMode: config.testMode,
                    version: config.version,
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
