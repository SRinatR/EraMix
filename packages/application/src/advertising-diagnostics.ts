import {
  validateEffectiveAdvertisingProviderConfig,
  type AdvertisingProvider,
  type ConsentCategory,
  type PlatformRole,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { AdvertisingProviderConfigRepository } from './repositories.js';

/**
 * Admin preview/diagnostics for the advertising-integration control plane
 * (CLAUDE.md item 6: "diagnostic health and emergency disablement"). There is
 * no live provider dispatch in this codebase yet (a deliberate, documented
 * boundary — no credentials, no invented endpoint), so unlike the GA4/Yandex
 * Metrica/IndexNow diagnostics this never reports a "last delivery result";
 * it reports the same config-validity/emergency-disablement state the
 * `settings.manage` admin already edits on `/admin/advertising`, so it can be
 * verified at a glance without re-deriving it from the raw form. Never
 * exposes `credentialSecretRef`'s value — only whether one is configured,
 * the same "presence, not value" convention `getIndexNowDiagnostics` uses for
 * the deployment key.
 */
export interface AdvertisingProviderDiagnostic {
  readonly provider: AdvertisingProvider;
  readonly enabled: boolean;
  readonly consentCategory: ConsentCategory;
  readonly testMode: boolean;
  readonly configValid: boolean;
  readonly credentialConfigured: boolean;
}

export async function getAdvertisingDiagnostics(
  deps: { readonly repo: AdvertisingProviderConfigRepository },
  actorRole: PlatformRole,
): Promise<readonly AdvertisingProviderDiagnostic[]> {
  requirePermission(actorRole, 'settings.manage');
  const configs = await deps.repo.listAll();

  return configs.map((config) => {
    let configValid = true;
    try {
      validateEffectiveAdvertisingProviderConfig(config);
    } catch {
      configValid = false;
    }
    return {
      provider: config.provider,
      enabled: config.enabled,
      consentCategory: config.consentCategory,
      testMode: config.testMode,
      configValid,
      credentialConfigured: (config.credentialSecretRef ?? '').trim().length > 0,
    };
  });
}
