import { AccessDeniedError, ConcurrencyConflictError, ValidationFailedError } from '@eramix/domain';
import type { PlatformSettings, PlatformSettingsHistoryEntry } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import type {
  AuditEventRepository,
  OutboxMessageRepository,
  PlatformSettingsHistoryRepository,
  PlatformSettingsRepository,
} from './repositories.js';
import {
  buildPlatformSettingsPreview,
  getPlatformSettings,
  listPlatformSettingsHistory,
  rollbackPlatformSettings,
  updatePlatformSettings,
} from './settings.js';

class InMemoryUnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

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

function fakeSettingsRepo(
  initial: PlatformSettings,
): PlatformSettingsRepository & { current: PlatformSettings } {
  const state = { current: initial };
  return {
    get current() {
      return state.current;
    },
    set current(value: PlatformSettings) {
      state.current = value;
    },
    get: () => Promise.resolve(state.current),
    update: (expectedVersion, patch, updatedByUserId) => {
      if (state.current.version !== expectedVersion) {
        throw new ConcurrencyConflictError('Stale version.', {
          expected: expectedVersion,
          actual: state.current.version,
        });
      }
      const merged: Record<string, unknown> = { ...state.current };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) {
          continue;
        }
        merged[key] = value === null ? undefined : value;
      }
      merged.version = state.current.version + 1;
      merged.updatedByUserId = updatedByUserId;
      merged.updatedAt = new Date();
      state.current = merged as unknown as PlatformSettings;
      return Promise.resolve(state.current);
    },
  };
}

function fakeHistoryRepo(): PlatformSettingsHistoryRepository & {
  entries: PlatformSettingsHistoryEntry[];
} {
  const entries: PlatformSettingsHistoryEntry[] = [];
  return {
    entries,
    record: (entry) => {
      const created: PlatformSettingsHistoryEntry = {
        id: `history-${entries.length + 1}`,
        createdAt: new Date(),
        ...entry,
      };
      entries.unshift(created);
      return Promise.resolve(created);
    },
    list: (input) =>
      Promise.resolve({
        data: entries.slice(0, input?.limit ?? 20),
        page: { hasMore: false },
      }),
  };
}

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

function fakeOutboxRepo(): OutboxMessageRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    enqueue: (message) => {
      calls.push(message);
      return Promise.resolve({
        id: 'outbox-1',
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        ...message,
      });
    },
    claimPending: () => Promise.resolve([]),
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
    markDeadLetter: () => Promise.resolve(),
  };
}

function makeDeps(initial: PlatformSettings = baseSettings()) {
  return {
    settingsRepo: fakeSettingsRepo(initial),
    historyRepo: fakeHistoryRepo(),
    auditRepo: fakeAuditRepo(),
    outboxRepo: fakeOutboxRepo(),
    uow: new InMemoryUnitOfWork(),
  };
}

describe('getPlatformSettings', () => {
  it('returns the current singleton row', async () => {
    const deps = makeDeps();
    await expect(getPlatformSettings(deps)).resolves.toMatchObject({
      canonicalHost: 'eramix.example',
    });
  });
});

describe('updatePlatformSettings', () => {
  it('denies a non-ADMIN actor (settings.manage is ADMIN-only)', async () => {
    const deps = makeDeps();
    await expect(
      updatePlatformSettings(deps, {
        expectedVersion: 0,
        patch: { canonicalHost: 'new.example' },
        actorUserId: 'user-1',
        actorRole: 'MANAGER',
      }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('applies a patch, bumps version, and records history + audit + outbox', async () => {
    const deps = makeDeps();
    const updated = await updatePlatformSettings(deps, {
      expectedVersion: 0,
      patch: { canonicalHost: 'new.eramix.example' },
      changeReason: 'Domain migration',
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    });
    expect(updated.canonicalHost).toBe('new.eramix.example');
    expect(updated.version).toBe(1);
    expect(deps.historyRepo.entries).toHaveLength(1);
    expect(deps.historyRepo.entries[0]).toMatchObject({
      previousVersion: 0,
      changeReason: 'Domain migration',
      changedByUserId: 'admin-1',
    });
    expect(deps.historyRepo.entries[0]?.previousSnapshot.canonicalHost).toBe('eramix.example');
    expect(deps.auditRepo.calls).toEqual([
      expect.objectContaining({ action: 'platform_settings.updated' }),
    ]);
    expect(deps.outboxRepo.calls).toEqual([
      expect.objectContaining({ eventType: 'platform_settings.updated' }),
    ]);
  });

  it('clears an optional field when the patch sends null', async () => {
    const deps = makeDeps(baseSettings({ organizationName: 'EraMix LLC' }));
    const updated = await updatePlatformSettings(deps, {
      expectedVersion: 0,
      patch: { organizationName: null },
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    });
    expect(updated.organizationName).toBeUndefined();
  });

  it('rejects an invalid effective state (bad canonicalHost) before writing anything', async () => {
    const deps = makeDeps();
    await expect(
      updatePlatformSettings(deps, {
        expectedVersion: 0,
        patch: { canonicalHost: 'not a host' },
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      }),
    ).rejects.toThrow(ValidationFailedError);
    expect(deps.historyRepo.entries).toHaveLength(0);
    expect(deps.auditRepo.calls).toHaveLength(0);
    expect(deps.outboxRepo.calls).toHaveLength(0);
  });

  it('rejects merchantCenterEnabled: true fail-closed (no Offer model yet)', async () => {
    const deps = makeDeps();
    await expect(
      updatePlatformSettings(deps, {
        expectedVersion: 0,
        patch: { merchantCenterEnabled: true },
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      }),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('throws ConcurrencyConflictError on a stale expectedVersion', async () => {
    const deps = makeDeps();
    await expect(
      updatePlatformSettings(deps, {
        expectedVersion: 5,
        patch: { canonicalHost: 'new.example.com' },
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      }),
    ).rejects.toThrow(ConcurrencyConflictError);
  });
});

describe('rollbackPlatformSettings', () => {
  it('applies a past snapshot as a new audited update', async () => {
    const deps = makeDeps();
    const afterFirstChange = await updatePlatformSettings(deps, {
      expectedVersion: 0,
      patch: { canonicalHost: 'changed.example' },
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    });
    expect(afterFirstChange.canonicalHost).toBe('changed.example');

    const historyEntryId = deps.historyRepo.entries[0]?.id;
    if (historyEntryId === undefined) {
      throw new Error('expected a history entry');
    }
    const rolledBack = await rollbackPlatformSettings(deps, {
      historyEntryId,
      expectedVersion: 1,
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    });
    expect(rolledBack.canonicalHost).toBe('eramix.example');
    expect(rolledBack.version).toBe(2);
    expect(deps.historyRepo.entries).toHaveLength(2);
  });
});

describe('listPlatformSettingsHistory', () => {
  it('delegates to the history repository', async () => {
    const deps = makeDeps();
    await expect(listPlatformSettingsHistory(deps)).resolves.toEqual({
      data: [],
      page: { hasMore: false },
    });
  });
});

describe('buildPlatformSettingsPreview', () => {
  it('omits organizationJsonLd when no organization name is set', () => {
    const preview = buildPlatformSettingsPreview(baseSettings());
    expect(preview.organizationJsonLd).toBeUndefined();
    expect(preview.canonicalOrigin).toBe('https://eramix.example');
  });

  it('builds organizationJsonLd once a name is set', () => {
    const preview = buildPlatformSettingsPreview(
      baseSettings({ organizationName: 'EraMix LLC', organizationEmail: 'info@eramix.example' }),
    );
    expect(preview.organizationJsonLd).toMatchObject({
      '@type': 'Organization',
      name: 'EraMix LLC',
      email: 'info@eramix.example',
    });
  });

  it('reports integration health from the settings flags/tokens', () => {
    const preview = buildPlatformSettingsPreview(
      baseSettings({ ga4Enabled: true, searchConsoleVerificationToken: 'token-1' }),
    );
    expect(preview.integrationHealth.ga4).toBe('enabled');
    expect(preview.integrationHealth.searchConsole).toBe('verified');
    expect(preview.integrationHealth.bing).toBe('not_verified');
    expect(preview.integrationHealth.merchantCenter).toBe('disabled');
  });
});
