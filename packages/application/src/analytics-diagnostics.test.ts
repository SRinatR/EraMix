import { AccessDeniedError } from '@eramix/domain';
import type { PlatformSettings } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { getAnalyticsDiagnostics } from './analytics-diagnostics.js';
import type {
  AnalyticsSinkStatus,
  AnalyticsSinkStatusRepository,
  PlatformSettingsRepository,
} from './repositories.js';

function baseSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    id: 'singleton',
    canonicalHost: 'eramix.example',
    forceHttps: true,
    stripTrailingSlash: true,
    crawlerGlobalNoindex: false,
    googleExtendedAllowed: true,
    aiCompatibilityFilesEnabled: false,
    analyticsConsentRequired: true,
    ga4Enabled: false,
    yandexMetricaEnabled: false,
    rustAnalyticsEnabled: false,
    indexNowEnabled: false,
    merchantCenterEnabled: false,
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    version: 0,
    ...overrides,
  };
}

function fakeSettingsRepo(settings: PlatformSettings): PlatformSettingsRepository {
  return {
    get: () => Promise.resolve(settings),
    update: () => {
      throw new Error('not needed for these tests');
    },
  };
}

function fakeSinkStatusRepo(
  statuses: readonly AnalyticsSinkStatus[],
): AnalyticsSinkStatusRepository {
  return {
    listAll: () => Promise.resolve(statuses),
    recordResult: () => {
      throw new Error('not needed for these tests');
    },
  };
}

describe('getAnalyticsDiagnostics', () => {
  it('denies an actor without settings.manage', async () => {
    await expect(
      getAnalyticsDiagnostics(
        { settingsRepo: fakeSettingsRepo(baseSettings()), sinkStatusRepo: fakeSinkStatusRepo([]) },
        'CONTENT_EDITOR',
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('reports enabled/configValid per sink from PlatformSettings, and "never attempted" when no status row exists', async () => {
    const settings = baseSettings({
      ga4Enabled: true,
      ga4MeasurementId: 'G-TEST123',
      yandexMetricaEnabled: false,
    });

    const result = await getAnalyticsDiagnostics(
      { settingsRepo: fakeSettingsRepo(settings), sinkStatusRepo: fakeSinkStatusRepo([]) },
      'ADMIN',
    );

    expect(result).toHaveLength(3);
    const ga4 = result.find((r) => r.sink === 'ga4');
    expect(ga4).toMatchObject({ enabled: true, configValid: true, lastAttemptAt: undefined });
    const yandex = result.find((r) => r.sink === 'yandex_metrica');
    expect(yandex).toMatchObject({ enabled: false, configValid: false });
  });

  it('reports configValid: false for GA4 when enabled but no measurementId is set (never a fabricated ID)', async () => {
    const settings = baseSettings({ ga4Enabled: true });

    const result = await getAnalyticsDiagnostics(
      { settingsRepo: fakeSettingsRepo(settings), sinkStatusRepo: fakeSinkStatusRepo([]) },
      'ADMIN',
    );

    expect(result.find((r) => r.sink === 'ga4')).toMatchObject({
      enabled: true,
      configValid: false,
    });
  });

  it('surfaces the last recorded delivery result per sink, joined by sink name', async () => {
    const settings = baseSettings({ ga4Enabled: true, ga4MeasurementId: 'G-TEST123' });
    const statuses: readonly AnalyticsSinkStatus[] = [
      {
        sink: 'ga4',
        lastAttemptAt: new Date('2026-08-03T10:00:00.000Z'),
        lastSucceeded: true,
        lastSkipped: false,
      },
      {
        sink: 'rust_analytics',
        lastAttemptAt: new Date('2026-08-03T09:00:00.000Z'),
        lastSucceeded: false,
        lastSkipped: false,
        lastError: 'Rust analytics service contract is not yet available',
      },
    ];

    const result = await getAnalyticsDiagnostics(
      { settingsRepo: fakeSettingsRepo(settings), sinkStatusRepo: fakeSinkStatusRepo(statuses) },
      'ADMIN',
    );

    expect(result.find((r) => r.sink === 'ga4')).toMatchObject({
      lastAttemptAt: '2026-08-03T10:00:00.000Z',
      lastSucceeded: true,
    });
    expect(result.find((r) => r.sink === 'rust_analytics')).toMatchObject({
      lastSucceeded: false,
      lastError: 'Rust analytics service contract is not yet available',
    });
    expect(result.find((r) => r.sink === 'yandex_metrica')?.lastAttemptAt).toBeUndefined();
  });

  it('never exposes a secret (e.g. GA4_API_SECRET is not a field on the diagnostic at all)', async () => {
    const settings = baseSettings({ ga4Enabled: true, ga4MeasurementId: 'G-TEST123' });

    const result = await getAnalyticsDiagnostics(
      { settingsRepo: fakeSettingsRepo(settings), sinkStatusRepo: fakeSinkStatusRepo([]) },
      'ADMIN',
    );

    for (const diagnostic of result) {
      expect(diagnostic).not.toHaveProperty('apiSecret');
      expect(diagnostic).not.toHaveProperty('ga4MeasurementId');
    }
  });
});
