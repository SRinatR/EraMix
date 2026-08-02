import {
  type AdvertisingProviderConfigPatch,
  type AdvertisingProviderConfigRepository,
} from '@eramix/application';
import {
  ResourceNotFoundError,
  type AdvertisingProviderConfig,
  type AdvertisingProvider,
} from '@eramix/domain';
import type { AdvertisingProviderConfig as AdvertisingProviderConfigRow } from '../generated/prisma/client.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { assertOptimisticLockAcquired } from '../prisma-error-mapping.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaAdvertisingProviderConfigRepository implements AdvertisingProviderConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByProvider(
    provider: AdvertisingProvider,
  ): Promise<AdvertisingProviderConfig | undefined> {
    const row = await resolveClient(this.prisma).advertisingProviderConfig.findUnique({
      where: { provider },
    });
    return row ? toDomain(row) : undefined;
  }

  async listAll(): Promise<readonly AdvertisingProviderConfig[]> {
    const rows = await resolveClient(this.prisma).advertisingProviderConfig.findMany({
      orderBy: { provider: 'asc' },
    });
    return rows.map(toDomain);
  }

  async update(
    provider: AdvertisingProvider,
    expectedVersion: number,
    patch: AdvertisingProviderConfigPatch,
  ): Promise<AdvertisingProviderConfig> {
    const client = resolveClient(this.prisma);
    const data = toPrismaUpdateData(patch);
    const { count } = await client.advertisingProviderConfig.updateMany({
      where: { provider, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Advertising provider config ${provider} was modified by another operation (expected version ${expectedVersion}).`,
      { provider, expectedVersion },
    );
    const updated = await client.advertisingProviderConfig.findUnique({ where: { provider } });
    if (!updated) {
      throw new ResourceNotFoundError(
        `Advertising provider config ${provider} not found after update.`,
        { provider },
      );
    }
    return toDomain(updated);
  }
}

function toPrismaUpdateData(patch: AdvertisingProviderConfigPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    data[key] = value === null ? null : value;
  }
  return data;
}

function toDomain(row: AdvertisingProviderConfigRow): AdvertisingProviderConfig {
  return {
    id: row.id,
    provider: row.provider,
    enabled: row.enabled,
    consentCategory: row.consentCategory,
    accountId: nullToUndefined(row.accountId),
    containerId: nullToUndefined(row.containerId),
    pixelId: nullToUndefined(row.pixelId),
    credentialSecretRef: nullToUndefined(row.credentialSecretRef),
    testMode: row.testMode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
