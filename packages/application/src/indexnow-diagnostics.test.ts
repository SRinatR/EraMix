import { AccessDeniedError } from '@eramix/domain';
import type { PlatformSettings } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { getIndexNowDiagnostics } from './indexnow-diagnostics.js';
import type {
  IndexNowEngineStatus,
  IndexNowEngineStatusRepository,
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

function fakeEngineStatusRepo(
  statuses: readonly IndexNowEngineStatus[],
): IndexNowEngineStatusRepository {
  return {
    listAll: () => Promise.resolve(statuses),
    recordResult: () => {
      throw new Error('not needed for these tests');
    },
  };
}

describe('getIndexNowDiagnostics', () => {
  it('denies an actor without settings.manage', async () => {
    await expect(
      getIndexNowDiagnostics(
        {
          settingsRepo: fakeSettingsRepo(baseSettings()),
          engineStatusRepo: fakeEngineStatusRepo([]),
        },
        'CONTENT_EDITOR',
        true,
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('is effectivelyActive only when enabled, not sitewide-noindexed, and the key is configured', async () => {
    const enabledAndConfigured = await getIndexNowDiagnostics(
      {
        settingsRepo: fakeSettingsRepo(baseSettings({ indexNowEnabled: true })),
        engineStatusRepo: fakeEngineStatusRepo([]),
      },
      'ADMIN',
      true,
    );
    expect(enabledAndConfigured.effectivelyActive).toBe(true);

    const noKey = await getIndexNowDiagnostics(
      {
        settingsRepo: fakeSettingsRepo(baseSettings({ indexNowEnabled: true })),
        engineStatusRepo: fakeEngineStatusRepo([]),
      },
      'ADMIN',
      false,
    );
    expect(noKey.effectivelyActive).toBe(false);
  });

  it('is never effectivelyActive while crawlerGlobalNoindex is on, even when indexNowEnabled is true and the key is configured', async () => {
    const result = await getIndexNowDiagnostics(
      {
        settingsRepo: fakeSettingsRepo(
          baseSettings({ indexNowEnabled: true, crawlerGlobalNoindex: true }),
        ),
        engineStatusRepo: fakeEngineStatusRepo([]),
      },
      'ADMIN',
      true,
    );

    expect(result.effectivelyActive).toBe(false);
    expect(result.crawlerGlobalNoindex).toBe(true);
  });

  it('surfaces the last recorded submission result per engine', async () => {
    const statuses: readonly IndexNowEngineStatus[] = [
      {
        engine: 'bing',
        lastAttemptAt: new Date('2026-08-03T10:00:00.000Z'),
        lastSucceeded: true,
        lastStatusCode: 200,
        lastUrlCount: 3,
      },
      {
        engine: 'yandex',
        lastAttemptAt: new Date('2026-08-03T10:00:00.000Z'),
        lastSucceeded: false,
        lastError: 'HTTP 429',
        lastUrlCount: 3,
      },
    ];

    const result = await getIndexNowDiagnostics(
      {
        settingsRepo: fakeSettingsRepo(baseSettings({ indexNowEnabled: true })),
        engineStatusRepo: fakeEngineStatusRepo(statuses),
      },
      'ADMIN',
      true,
    );

    expect(result.engines).toHaveLength(2);
    expect(result.engines.find((e) => e.engine === 'bing')).toMatchObject({
      lastSucceeded: true,
      lastStatusCode: 200,
    });
    expect(result.engines.find((e) => e.engine === 'yandex')).toMatchObject({
      lastSucceeded: false,
      lastError: 'HTTP 429',
    });
  });

  it('never exposes the IndexNow key itself — only a boolean keyConfigured flag', async () => {
    const result = await getIndexNowDiagnostics(
      {
        settingsRepo: fakeSettingsRepo(baseSettings()),
        engineStatusRepo: fakeEngineStatusRepo([]),
      },
      'ADMIN',
      true,
    );

    expect(result).not.toHaveProperty('indexNowKey');
    expect(result).not.toHaveProperty('key');
    expect(typeof result.keyConfigured).toBe('boolean');
  });
});
