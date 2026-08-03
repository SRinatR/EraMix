import type { PlatformRole } from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { AnalyticsSinkStatusRepository, PlatformSettingsRepository } from './repositories.js';

/**
 * Admin diagnostics for the 3 analytics sinks (CLAUDE.md: "Provide admin
 * diagnostics showing enabled state, configuration validity and last safe
 * delivery result and redacted error state, without exposing secrets or
 * PII"). `configValid` only checks for the presence of the non-secret
 * PlatformSettings identifier each sink needs (GA4_API_SECRET itself is
 * never read or exposed here — it is an env-only deployment secret,
 * packages/infrastructure/src/env.ts). `rust_analytics` takes no
 * configuration at all today (packages/infrastructure/src/analytics/
 * rust-analytics-event-sink.ts always no-ops), so it is trivially
 * "configured"; its real state is only ever visible through
 * `lastError` once/if a real dispatch attempt is ever recorded.
 */
export type AnalyticsSinkName = 'ga4' | 'yandex_metrica' | 'rust_analytics';

export interface AnalyticsSinkDiagnostic {
  readonly sink: AnalyticsSinkName;
  readonly enabled: boolean;
  readonly configValid: boolean;
  readonly lastAttemptAt?: string | undefined;
  readonly lastSucceeded?: boolean | undefined;
  readonly lastSkipped?: boolean | undefined;
  readonly lastError?: string | undefined;
}

export async function getAnalyticsDiagnostics(
  deps: {
    readonly settingsRepo: PlatformSettingsRepository;
    readonly sinkStatusRepo: AnalyticsSinkStatusRepository;
  },
  actorRole: PlatformRole,
): Promise<readonly AnalyticsSinkDiagnostic[]> {
  requirePermission(actorRole, 'settings.manage');
  const [settings, statuses] = await Promise.all([
    deps.settingsRepo.get(),
    deps.sinkStatusRepo.listAll(),
  ]);
  const statusBySink = new Map(statuses.map((status) => [status.sink, status]));

  const definitions: readonly {
    readonly sink: AnalyticsSinkName;
    readonly enabled: boolean;
    readonly configValid: boolean;
  }[] = [
    {
      sink: 'ga4',
      enabled: settings.ga4Enabled,
      configValid: settings.ga4MeasurementId !== undefined,
    },
    {
      sink: 'yandex_metrica',
      enabled: settings.yandexMetricaEnabled,
      configValid: settings.yandexMetricaCounterId !== undefined,
    },
    { sink: 'rust_analytics', enabled: settings.rustAnalyticsEnabled, configValid: true },
  ];

  return definitions.map((definition) => {
    const status = statusBySink.get(definition.sink);
    return {
      sink: definition.sink,
      enabled: definition.enabled,
      configValid: definition.configValid,
      lastAttemptAt: status?.lastAttemptAt.toISOString(),
      lastSucceeded: status?.lastSucceeded,
      lastSkipped: status?.lastSkipped,
      lastError: status?.lastError,
    };
  });
}
