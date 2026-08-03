import { AccessDeniedError } from '@eramix/domain';
import type { AdvertisingProviderConfig } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { getAdvertisingDiagnostics } from './advertising-diagnostics.js';
import type { AdvertisingProviderConfigRepository } from './repositories.js';

function makeConfig(overrides: Partial<AdvertisingProviderConfig> = {}): AdvertisingProviderConfig {
  return {
    id: 'config-1',
    provider: 'GOOGLE_ADS',
    enabled: false,
    consentCategory: 'ADVERTISING',
    testMode: true,
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    version: 0,
    ...overrides,
  };
}

function fakeRepo(
  configs: readonly AdvertisingProviderConfig[],
): AdvertisingProviderConfigRepository {
  return {
    findByProvider: () => {
      throw new Error('not needed for these tests');
    },
    listAll: () => Promise.resolve(configs),
    update: () => {
      throw new Error('not needed for these tests');
    },
  };
}

describe('getAdvertisingDiagnostics', () => {
  it('denies an actor without settings.manage', async () => {
    await expect(
      getAdvertisingDiagnostics({ repo: fakeRepo([makeConfig()]) }, 'CONTENT_EDITOR'),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('reports configValid: true for a disabled provider with no identifiers', async () => {
    const [result] = await getAdvertisingDiagnostics({ repo: fakeRepo([makeConfig()]) }, 'ADMIN');
    expect(result).toMatchObject({ provider: 'GOOGLE_ADS', enabled: false, configValid: true });
  });

  it('reports configValid: true for an enabled provider with a real identifier', async () => {
    const [result] = await getAdvertisingDiagnostics(
      { repo: fakeRepo([makeConfig({ enabled: true, accountId: '123-456-7890' })]) },
      'ADMIN',
    );
    expect(result).toMatchObject({ enabled: true, configValid: true });
  });

  it('reports configValid: false for an enabled provider with no identifier (a malformed row bypassing the write-path validator)', async () => {
    const [result] = await getAdvertisingDiagnostics(
      { repo: fakeRepo([makeConfig({ enabled: true })]) },
      'ADMIN',
    );
    expect(result).toMatchObject({ enabled: true, configValid: false });
  });

  it('reports credentialConfigured as a boolean only — never the secret-store reference value itself', async () => {
    const [withRef] = await getAdvertisingDiagnostics(
      { repo: fakeRepo([makeConfig({ credentialSecretRef: 'google-ads-prod-secret' })]) },
      'ADMIN',
    );
    expect(withRef?.credentialConfigured).toBe(true);
    expect(JSON.stringify(withRef)).not.toContain('google-ads-prod-secret');

    const [withoutRef] = await getAdvertisingDiagnostics(
      { repo: fakeRepo([makeConfig()]) },
      'ADMIN',
    );
    expect(withoutRef?.credentialConfigured).toBe(false);
  });

  it('reports one diagnostic per configured provider, preserving repository order', async () => {
    const results = await getAdvertisingDiagnostics(
      {
        repo: fakeRepo([
          makeConfig({ provider: 'GOOGLE_ADS' }),
          makeConfig({ provider: 'META', consentCategory: 'ANALYTICS' }),
        ]),
      },
      'ADMIN',
    );
    expect(results.map((r) => r.provider)).toEqual(['GOOGLE_ADS', 'META']);
    expect(results[1]?.consentCategory).toBe('ANALYTICS');
  });
});
