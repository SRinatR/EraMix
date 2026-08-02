import {
  ResourceNotFoundError,
  validateEffectivePlatformSettings,
  type PlatformRole,
  type PlatformSettings,
  type PlatformSettingsHistoryEntry,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { CursorPage, CursorPaginationInput } from './pagination.js';
import type { UnitOfWork } from './ports.js';
import type {
  AuditEventRepository,
  OutboxMessageRepository,
  PlatformSettingsHistoryRepository,
  PlatformSettingsPatch,
  PlatformSettingsRepository,
} from './repositories.js';

/**
 * The Product Owner / admin control plane's read/write use cases
 * (docs/runbooks/search-visibility.md's "Settings, controls and recovery").
 * A failed save can never partially alter generated output: every write
 * validates the *effective* (merged) settings before persisting anything,
 * inside one transaction with the history/audit/outbox rows, so an
 * invalid patch never reaches the database at all.
 */

export interface PlatformSettingsDeps {
  readonly settingsRepo: PlatformSettingsRepository;
  readonly historyRepo: PlatformSettingsHistoryRepository;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
}

export async function getPlatformSettings(
  deps: Pick<PlatformSettingsDeps, 'settingsRepo'>,
): Promise<PlatformSettings> {
  return deps.settingsRepo.get();
}

/** Applies a tri-state patch onto the current settings, honoring the omitted=unchanged/null=clear/value=set idiom. */
function mergePatch(current: PlatformSettings, patch: PlatformSettingsPatch): PlatformSettings {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    next[key] = value === null ? undefined : value;
  }
  return next as unknown as PlatformSettings;
}

export interface UpdatePlatformSettingsInput {
  readonly expectedVersion: number;
  readonly patch: PlatformSettingsPatch;
  readonly changeReason?: string | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

export async function updatePlatformSettings(
  deps: PlatformSettingsDeps,
  input: UpdatePlatformSettingsInput,
): Promise<PlatformSettings> {
  requirePermission(input.actorRole, 'settings.manage');
  return deps.uow.runInTransaction(async () => {
    const current = await deps.settingsRepo.get();
    const effective = mergePatch(current, input.patch);
    validateEffectivePlatformSettings(effective);

    const updated = await deps.settingsRepo.update(
      input.expectedVersion,
      input.patch,
      input.actorUserId,
    );

    await deps.historyRepo.record({
      settingsId: 'singleton',
      previousVersion: current.version,
      previousSnapshot: current,
      changeReason: input.changeReason,
      changedByUserId: input.actorUserId,
    });
    const changedFields = Object.keys(input.patch);
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'platform_settings.updated',
      entityType: 'PlatformSettings',
      entityId: 'singleton',
      metadata: { changedFields, changeReason: input.changeReason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'PlatformSettings',
      aggregateId: 'singleton',
      eventType: 'platform_settings.updated',
      payload: { changedFields },
    });
    return updated;
  });
}

export async function listPlatformSettingsHistory(
  deps: Pick<PlatformSettingsDeps, 'historyRepo'>,
  input?: CursorPaginationInput,
): Promise<CursorPage<PlatformSettingsHistoryEntry>> {
  return deps.historyRepo.list(input);
}

export interface RollbackPlatformSettingsInput {
  readonly historyEntryId: string;
  readonly expectedVersion: number;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly traceId?: string | undefined;
}

/**
 * Rollback is implemented as "apply a past snapshot as a new, fully-audited
 * update" — never a destructive rewrite of the history table itself, so the
 * full change trail (including this rollback) always remains inspectable.
 */
export async function rollbackPlatformSettings(
  deps: PlatformSettingsDeps,
  input: RollbackPlatformSettingsInput,
): Promise<PlatformSettings> {
  requirePermission(input.actorRole, 'settings.manage');
  const page = await deps.historyRepo.list({ limit: 100 });
  const entry = page.data.find((candidate) => candidate.id === input.historyEntryId);
  if (!entry) {
    throw new ResourceNotFoundError(
      `Platform settings history entry ${input.historyEntryId} not found.`,
      { historyEntryId: input.historyEntryId },
    );
  }
  const snapshot = entry.previousSnapshot;
  const patch: PlatformSettingsPatch = {
    canonicalHost: snapshot.canonicalHost,
    forceHttps: snapshot.forceHttps,
    stripTrailingSlash: snapshot.stripTrailingSlash,
    organizationName: snapshot.organizationName ?? null,
    organizationLegalName: snapshot.organizationLegalName ?? null,
    organizationEmail: snapshot.organizationEmail ?? null,
    organizationPhone: snapshot.organizationPhone ?? null,
    organizationAddress: snapshot.organizationAddress ?? null,
    organizationSameAs: snapshot.organizationSameAs ?? null,
    seoDefaultTitleTemplate: snapshot.seoDefaultTitleTemplate ?? null,
    seoDefaultDescriptionFallback: snapshot.seoDefaultDescriptionFallback ?? null,
    ogFallbackImageUrl: snapshot.ogFallbackImageUrl ?? null,
    crawlerGlobalNoindex: snapshot.crawlerGlobalNoindex,
    googleExtendedAllowed: snapshot.googleExtendedAllowed,
    aiCompatibilityFilesEnabled: snapshot.aiCompatibilityFilesEnabled,
    analyticsConsentRequired: snapshot.analyticsConsentRequired,
    ga4Enabled: snapshot.ga4Enabled,
    ga4MeasurementId: snapshot.ga4MeasurementId ?? null,
    yandexMetricaEnabled: snapshot.yandexMetricaEnabled,
    yandexMetricaCounterId: snapshot.yandexMetricaCounterId ?? null,
    rustAnalyticsEnabled: snapshot.rustAnalyticsEnabled,
    searchConsoleVerificationToken: snapshot.searchConsoleVerificationToken ?? null,
    yandexWebmasterVerificationToken: snapshot.yandexWebmasterVerificationToken ?? null,
    bingVerificationToken: snapshot.bingVerificationToken ?? null,
    indexNowEnabled: snapshot.indexNowEnabled,
    merchantCenterEnabled: snapshot.merchantCenterEnabled,
  };
  return updatePlatformSettings(deps, {
    expectedVersion: input.expectedVersion,
    patch,
    changeReason: `Rollback to the state before history entry ${input.historyEntryId} (version ${entry.previousVersion}).`,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    traceId: input.traceId,
  });
}

/**
 * Read-only "effective output" preview (search-visibility.md: "Admin
 * provides read-only live views for generated robots.txt... rendered
 * metadata/JSON-LD... integration health"). Secrets are never stored on
 * PlatformSettings in the first place (see the schema comment), so no
 * redaction step is needed here — only non-secret verification
 * tokens/IDs/booleans ever reach this preview.
 */
export interface PlatformSettingsPreview {
  readonly canonicalOrigin: string;
  readonly robotsGlobalNoindex: boolean;
  readonly organizationJsonLd:
    | {
        readonly '@context': 'https://schema.org';
        readonly '@type': 'Organization';
        readonly name: string;
        readonly legalName?: string;
        readonly email?: string;
        readonly telephone?: string;
        readonly address?: string;
        readonly sameAs?: readonly string[];
      }
    | undefined;
  readonly integrationHealth: {
    readonly ga4: 'enabled' | 'disabled';
    readonly yandexMetrica: 'enabled' | 'disabled';
    readonly rustAnalytics: 'enabled' | 'disabled';
    readonly searchConsole: 'verified' | 'not_verified';
    readonly yandexWebmaster: 'verified' | 'not_verified';
    readonly bing: 'verified' | 'not_verified';
    readonly indexNow: 'enabled' | 'disabled';
    readonly merchantCenter: 'enabled' | 'disabled';
  };
}

/** Canonical public origin — the single source every producer of an absolute public URL (robots.txt, sitemap, JSON-LD, metadata) must read instead of re-deriving its own fallback. */
export function buildCanonicalOrigin(settings: PlatformSettings): string {
  const scheme = settings.forceHttps ? 'https' : 'http';
  return `${scheme}://${settings.canonicalHost}`;
}

export type OrganizationJsonLd = NonNullable<PlatformSettingsPreview['organizationJsonLd']>;

/**
 * The single producer of Organization JSON-LD (CLAUDE.md: "only when real
 * and maintained") — returns undefined until an admin sets a real
 * organization name; never fabricates one. Reused by both the settings
 * preview endpoint and the public home page so there is exactly one place
 * that decides what this markup contains.
 */
export function buildOrganizationJsonLd(
  settings: PlatformSettings,
): OrganizationJsonLd | undefined {
  if (!settings.organizationName) {
    return undefined;
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.organizationName,
    ...(settings.organizationLegalName !== undefined
      ? { legalName: settings.organizationLegalName }
      : {}),
    ...(settings.organizationEmail !== undefined ? { email: settings.organizationEmail } : {}),
    ...(settings.organizationPhone !== undefined ? { telephone: settings.organizationPhone } : {}),
    ...(settings.organizationAddress !== undefined
      ? { address: settings.organizationAddress }
      : {}),
    ...(settings.organizationSameAs !== undefined ? { sameAs: settings.organizationSameAs } : {}),
  };
}

export function buildPlatformSettingsPreview(settings: PlatformSettings): PlatformSettingsPreview {
  return {
    canonicalOrigin: buildCanonicalOrigin(settings),
    robotsGlobalNoindex: settings.crawlerGlobalNoindex,
    organizationJsonLd: buildOrganizationJsonLd(settings),
    integrationHealth: {
      ga4: settings.ga4Enabled ? 'enabled' : 'disabled',
      yandexMetrica: settings.yandexMetricaEnabled ? 'enabled' : 'disabled',
      rustAnalytics: settings.rustAnalyticsEnabled ? 'enabled' : 'disabled',
      searchConsole: settings.searchConsoleVerificationToken ? 'verified' : 'not_verified',
      yandexWebmaster: settings.yandexWebmasterVerificationToken ? 'verified' : 'not_verified',
      bing: settings.bingVerificationToken ? 'verified' : 'not_verified',
      indexNow: settings.indexNowEnabled ? 'enabled' : 'disabled',
      merchantCenter: settings.merchantCenterEnabled ? 'enabled' : 'disabled',
    },
  };
}
