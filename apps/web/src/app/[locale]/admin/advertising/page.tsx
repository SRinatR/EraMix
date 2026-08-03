import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import {
  getAdvertisingDiagnostics,
  hasPermission,
  listAdvertisingProviderConfigs,
} from '@eramix/application';
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
 * plane). Configuration/enablement plus read-only preview/diagnostics
 * (config validity, credential-configured state, test mode) — there is no
 * live provider dispatch in this codebase yet (no credentials, no invented
 * endpoint), so conversion mapping, attribution/UTM rules, and server-side
 * conversion dispatch remain a later slice gated on a real integration
 * authorization.
 */
export default async function AdminAdvertisingPage() {
  const actor = await getServerActor();
  if (!actor || !hasPermission(actor.platformRole, 'settings.manage')) {
    notFound();
  }

  const container = getContainer();
  const [configs, diagnostics] = await Promise.all([
    listAdvertisingProviderConfigs({ repo: container.advertisingProviders }, actor.platformRole),
    getAdvertisingDiagnostics({ repo: container.advertisingProviders }, actor.platformRole),
  ]);
  const diagnosticByProvider = new Map(diagnostics.map((d) => [d.provider, d]));

  return (
    <main>
      <h1>Advertising integrations</h1>
      <p>
        Provider enablement, consent category, and non-secret account/container/pixel identifiers.
        Credentials are never entered here — only a reference to where the real value lives in the
        deployment secret store. There is no live provider dispatch yet — configuration and
        preview/diagnostics only.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Status</th>
            <th>Diagnostics</th>
            <th>Configuration</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((config) => {
            const diagnostic = diagnosticByProvider.get(config.provider);
            return (
              <tr key={config.provider}>
                <td>{PROVIDER_LABELS[config.provider] ?? config.provider}</td>
                <td>{config.enabled ? 'Enabled' : 'Disabled'}</td>
                <td>
                  {diagnostic ? (
                    <ul>
                      <li>Config valid: {diagnostic.configValid ? 'Yes' : 'No'}</li>
                      <li>
                        Credential configured: {diagnostic.credentialConfigured ? 'Yes' : 'No'}
                      </li>
                      <li>Test mode: {diagnostic.testMode ? 'Yes' : 'No'}</li>
                    </ul>
                  ) : null}
                </td>
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
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
