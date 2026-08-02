import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  type CursorPage,
  type CursorPaginationInput,
  type PlatformSettingsHistoryRepository,
  type PlatformSettingsPatch,
  type PlatformSettingsRepository,
} from '@eramix/application';
import {
  ResourceNotFoundError,
  type PlatformSettings,
  type PlatformSettingsHistoryEntry,
} from '@eramix/domain';
import type {
  PlatformSettings as PlatformSettingsRow,
  PlatformSettingsHistory as PlatformSettingsHistoryRow,
} from '../generated/prisma/client.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { buildCursorOrderBy, combineWithCursor, type SortSpec } from './cursor-query.js';
import { assertOptimisticLockAcquired } from '../prisma-error-mapping.js';
import { resolveClient } from '../transaction-context.js';

const SETTINGS_ID = 'singleton';

export class PrismaPlatformSettingsRepository implements PlatformSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(): Promise<PlatformSettings> {
    const row = await resolveClient(this.prisma).platformSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!row) {
      throw new ResourceNotFoundError(
        'PlatformSettings singleton row is missing — it is created only by prisma/seed.ts.',
        { id: SETTINGS_ID },
      );
    }
    return toDomain(row);
  }

  async update(
    expectedVersion: number,
    patch: PlatformSettingsPatch,
    updatedByUserId: string | undefined,
  ): Promise<PlatformSettings> {
    const client = resolveClient(this.prisma);
    const data = toPrismaUpdateData(patch, updatedByUserId);
    const { count } = await client.platformSettings.updateMany({
      where: { id: SETTINGS_ID, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `PlatformSettings was modified by another operation (expected version ${expectedVersion}).`,
      { expectedVersion },
    );
    const updated = await client.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!updated) {
      throw new ResourceNotFoundError('PlatformSettings singleton row not found after update.', {
        id: SETTINGS_ID,
      });
    }
    return toDomain(updated);
  }
}

export class PrismaPlatformSettingsHistoryRepository implements PlatformSettingsHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(
    entry: Omit<PlatformSettingsHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<PlatformSettingsHistoryEntry> {
    const row = await resolveClient(this.prisma).platformSettingsHistory.create({
      data: {
        settingsId: entry.settingsId,
        previousVersion: entry.previousVersion,
        previousSnapshot: serializeSnapshot(entry.previousSnapshot),
        changeReason: entry.changeReason ?? null,
        changedByUserId: entry.changedByUserId ?? null,
      },
    });
    return toHistoryDomain(row);
  }

  async list(input: CursorPaginationInput = {}): Promise<CursorPage<PlatformSettingsHistoryEntry>> {
    const limit = clampLimit(input.limit);
    const sortSpec: SortSpec = { field: 'createdAt', direction: 'desc', kind: 'date' };
    const decoded = decodeCursor(input.cursor);
    const where = combineWithCursor({ settingsId: SETTINGS_ID }, sortSpec, decoded);
    const orderBy = buildCursorOrderBy(sortSpec);
    const client = resolveClient(this.prisma);
    const rows = await client.platformSettingsHistory.findMany({
      where,
      orderBy,
      take: limit + 1,
    });
    const items = rows.map(toHistoryDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: item.createdAt.toISOString(),
      id: item.id,
    }));
  }
}

function toPrismaUpdateData(
  patch: PlatformSettingsPatch,
  updatedByUserId: string | undefined,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    data[key] = value === null ? null : value;
  }
  if (updatedByUserId !== undefined) {
    data['updatedByUserId'] = updatedByUserId;
  }
  return data;
}

function toDomain(row: PlatformSettingsRow): PlatformSettings {
  return {
    id: 'singleton',
    canonicalHost: row.canonicalHost,
    forceHttps: row.forceHttps,
    stripTrailingSlash: row.stripTrailingSlash,
    organizationName: nullToUndefined(row.organizationName),
    organizationLegalName: nullToUndefined(row.organizationLegalName),
    organizationEmail: nullToUndefined(row.organizationEmail),
    organizationPhone: nullToUndefined(row.organizationPhone),
    organizationAddress: nullToUndefined(row.organizationAddress),
    organizationSameAs: nullToUndefined(row.organizationSameAs as string[] | null),
    seoDefaultTitleTemplate: nullToUndefined(row.seoDefaultTitleTemplate),
    seoDefaultDescriptionFallback: nullToUndefined(row.seoDefaultDescriptionFallback),
    ogFallbackImageUrl: nullToUndefined(row.ogFallbackImageUrl),
    crawlerGlobalNoindex: row.crawlerGlobalNoindex,
    googleExtendedAllowed: row.googleExtendedAllowed,
    aiCompatibilityFilesEnabled: row.aiCompatibilityFilesEnabled,
    analyticsConsentRequired: row.analyticsConsentRequired,
    ga4Enabled: row.ga4Enabled,
    ga4MeasurementId: nullToUndefined(row.ga4MeasurementId),
    yandexMetricaEnabled: row.yandexMetricaEnabled,
    yandexMetricaCounterId: nullToUndefined(row.yandexMetricaCounterId),
    rustAnalyticsEnabled: row.rustAnalyticsEnabled,
    searchConsoleVerificationToken: nullToUndefined(row.searchConsoleVerificationToken),
    yandexWebmasterVerificationToken: nullToUndefined(row.yandexWebmasterVerificationToken),
    bingVerificationToken: nullToUndefined(row.bingVerificationToken),
    indexNowEnabled: row.indexNowEnabled,
    merchantCenterEnabled: row.merchantCenterEnabled,
    updatedByUserId: nullToUndefined(row.updatedByUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/**
 * A PlatformSettings snapshot embedded in a JSONB column round-trips its
 * `createdAt`/`updatedAt` `Date` fields as ISO strings (Postgres JSONB has no
 * native date type) — serialize/deserialize explicitly rather than trusting
 * an `as` cast to paper over the shape change, so a caller reading
 * `previousSnapshot.createdAt` back out gets a real `Date`, not a string
 * masquerading as one.
 */
function serializeSnapshot(snapshot: PlatformSettings): object {
  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

function deserializeSnapshot(value: unknown): PlatformSettings {
  const raw = value as PlatformSettings & { createdAt: string; updatedAt: string };
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

function toHistoryDomain(row: PlatformSettingsHistoryRow): PlatformSettingsHistoryEntry {
  return {
    id: row.id,
    settingsId: 'singleton',
    previousVersion: row.previousVersion,
    previousSnapshot: deserializeSnapshot(row.previousSnapshot),
    changeReason: nullToUndefined(row.changeReason),
    changedByUserId: nullToUndefined(row.changedByUserId),
    createdAt: row.createdAt,
  };
}
