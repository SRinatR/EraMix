import { AccessDeniedError, ResourceNotFoundError, ValidationFailedError } from '@eramix/domain';
import type { AdvertisingProviderConfig } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import type { AuditEventRepository } from './repositories.js';
import { listAdvertisingProviderConfigs, updateAdvertisingProviderConfig } from './advertising.js';

function fakeAuditRepo(): AuditEventRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    record: (event) => {
      calls.push(event);
      return Promise.resolve({ id: 'audit-1', createdAt: new Date(), ...event });
    },
    listByEntity: () => Promise.resolve({ data: [], page: { hasMore: false } }),
  };
}

function makeConfig(overrides: Partial<AdvertisingProviderConfig> = {}): AdvertisingProviderConfig {
  return {
    id: 'config-1',
    provider: 'GOOGLE_ADS',
    enabled: false,
    consentCategory: 'ADVERTISING',
    testMode: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

describe('listAdvertisingProviderConfigs', () => {
  it('denies a CUSTOMER (no settings.manage permission)', async () => {
    const repo = {
      listAll: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      listAdvertisingProviderConfigs({ repo: repo as never }, 'CUSTOMER'),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('returns all provider configs for an ADMIN', async () => {
    const configs = [makeConfig(), makeConfig({ id: 'config-2', provider: 'META' })];
    const repo = { listAll: () => Promise.resolve(configs) };
    const result = await listAdvertisingProviderConfigs({ repo: repo as never }, 'ADMIN');
    expect(result).toHaveLength(2);
  });
});

describe('updateAdvertisingProviderConfig', () => {
  it('denies a MANAGER (no settings.manage permission)', async () => {
    const repo = {
      findById: () => {
        throw new Error('should not be called');
      },
      findByProvider: () => Promise.resolve(makeConfig()),
      update: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      updateAdvertisingProviderConfig(
        { repo: repo as never, auditRepo: fakeAuditRepo() },
        {
          provider: 'GOOGLE_ADS',
          expectedVersion: 0,
          patch: { enabled: true },
          actorUserId: 'user-1',
          actorRole: 'MANAGER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('throws ResourceNotFoundError for an unknown provider row', async () => {
    const repo = {
      findByProvider: () => Promise.resolve(undefined),
      update: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      updateAdvertisingProviderConfig(
        { repo: repo as never, auditRepo: fakeAuditRepo() },
        {
          provider: 'TIKTOK',
          expectedVersion: 0,
          patch: { enabled: true },
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('rejects enabling a provider with no identifier (fail-closed, validated against the merged effective state)', async () => {
    const repo = {
      findByProvider: () => Promise.resolve(makeConfig()),
      update: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      updateAdvertisingProviderConfig(
        { repo: repo as never, auditRepo: fakeAuditRepo() },
        {
          provider: 'GOOGLE_ADS',
          expectedVersion: 0,
          patch: { enabled: true },
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('accepts enabling a provider that already has an identifier from an earlier write, patch supplies only enabled', async () => {
    const current = makeConfig({ accountId: '123-456-7890' });
    const updated = { ...current, enabled: true, version: 1 };
    const repo = {
      findByProvider: () => Promise.resolve(current),
      update: () => Promise.resolve(updated),
    };
    const auditRepo = fakeAuditRepo();

    const result = await updateAdvertisingProviderConfig(
      { repo: repo as never, auditRepo },
      {
        provider: 'GOOGLE_ADS',
        expectedVersion: 0,
        patch: { enabled: true },
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        reason: 'Launching Q3 campaign.',
      },
    );

    expect(result.enabled).toBe(true);
    expect(auditRepo.calls).toHaveLength(1);
    expect(auditRepo.calls[0]).toMatchObject({
      action: 'advertising_provider.updated',
      metadata: { provider: 'GOOGLE_ADS', reason: 'Launching Q3 campaign.' },
    });
  });

  it('clears an identifier when the patch explicitly sets it to null', async () => {
    const current = makeConfig({ accountId: '123-456-7890', pixelId: '999888777' });
    const updated = { ...current, accountId: undefined, version: 1 };
    const repo = {
      findByProvider: () => Promise.resolve(current),
      update: () => Promise.resolve(updated),
    };

    const result = await updateAdvertisingProviderConfig(
      { repo: repo as never, auditRepo: fakeAuditRepo() },
      {
        provider: 'GOOGLE_ADS',
        expectedVersion: 0,
        patch: { accountId: null },
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(result.accountId).toBeUndefined();
  });
});
