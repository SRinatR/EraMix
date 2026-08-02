import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import {
  getPlatformSettings,
  requirePermission,
  updatePlatformSettings,
  type PlatformSettingsPatch,
} from '@eramix/application';
import type { PlatformSettings } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const nullableString = z.string().min(1).nullable().optional();
const nullableHttpsUrl = z.string().url().nullable().optional();

/**
 * Tri-state per field (omitted = unchanged, `null` = clear, value = set) —
 * the same idiom every other admin edit route in this repo already uses.
 * Secrets never appear here: only non-secret verification tokens/IDs.
 */
const updateSettingsSchema = z.object({
  expectedVersion: z.number().int().min(0),
  changeReason: z.string().min(1).max(500).optional(),
  canonicalHost: z.string().min(1).max(255).optional(),
  forceHttps: z.boolean().optional(),
  stripTrailingSlash: z.boolean().optional(),
  organizationName: nullableString,
  organizationLegalName: nullableString,
  organizationEmail: z.string().email().nullable().optional(),
  organizationPhone: nullableString,
  organizationAddress: nullableString,
  organizationSameAs: z.array(z.string().url()).nullable().optional(),
  seoDefaultTitleTemplate: nullableString,
  seoDefaultDescriptionFallback: nullableString,
  ogFallbackImageUrl: nullableHttpsUrl,
  crawlerGlobalNoindex: z.boolean().optional(),
  googleExtendedAllowed: z.boolean().optional(),
  aiCompatibilityFilesEnabled: z.boolean().optional(),
  analyticsConsentRequired: z.boolean().optional(),
  ga4Enabled: z.boolean().optional(),
  ga4MeasurementId: nullableString,
  yandexMetricaEnabled: z.boolean().optional(),
  yandexMetricaCounterId: nullableString,
  rustAnalyticsEnabled: z.boolean().optional(),
  searchConsoleVerificationToken: nullableString,
  yandexWebmasterVerificationToken: nullableString,
  bingVerificationToken: nullableString,
  indexNowEnabled: z.boolean().optional(),
  merchantCenterEnabled: z.boolean().optional(),
});

function toResponseBody(settings: PlatformSettings) {
  return {
    canonicalHost: settings.canonicalHost,
    forceHttps: settings.forceHttps,
    stripTrailingSlash: settings.stripTrailingSlash,
    organizationName: settings.organizationName ?? null,
    organizationLegalName: settings.organizationLegalName ?? null,
    organizationEmail: settings.organizationEmail ?? null,
    organizationPhone: settings.organizationPhone ?? null,
    organizationAddress: settings.organizationAddress ?? null,
    organizationSameAs: settings.organizationSameAs ?? null,
    seoDefaultTitleTemplate: settings.seoDefaultTitleTemplate ?? null,
    seoDefaultDescriptionFallback: settings.seoDefaultDescriptionFallback ?? null,
    ogFallbackImageUrl: settings.ogFallbackImageUrl ?? null,
    crawlerGlobalNoindex: settings.crawlerGlobalNoindex,
    googleExtendedAllowed: settings.googleExtendedAllowed,
    aiCompatibilityFilesEnabled: settings.aiCompatibilityFilesEnabled,
    analyticsConsentRequired: settings.analyticsConsentRequired,
    ga4Enabled: settings.ga4Enabled,
    ga4MeasurementId: settings.ga4MeasurementId ?? null,
    yandexMetricaEnabled: settings.yandexMetricaEnabled,
    yandexMetricaCounterId: settings.yandexMetricaCounterId ?? null,
    rustAnalyticsEnabled: settings.rustAnalyticsEnabled,
    searchConsoleVerificationToken: settings.searchConsoleVerificationToken ?? null,
    yandexWebmasterVerificationToken: settings.yandexWebmasterVerificationToken ?? null,
    bingVerificationToken: settings.bingVerificationToken ?? null,
    indexNowEnabled: settings.indexNowEnabled,
    merchantCenterEnabled: settings.merchantCenterEnabled,
    updatedByUserId: settings.updatedByUserId ?? null,
    updatedAt: settings.updatedAt.toISOString(),
    version: settings.version,
  };
}

export const GET = withApiHandler('admin.settings.get', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'settings.manage');

  const container = getContainer();
  const settings = await getPlatformSettings({ settingsRepo: container.settingsRepo });
  return NextResponse.json(toResponseBody(settings));
});

export const PATCH = withApiHandler('admin.settings.update', async (request, traceId) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  // updatePlatformSettings enforces settings.manage internally — no
  // duplicate check here, same convention as updateCategoryTranslation etc.

  const body = updateSettingsSchema.parse(await request.json());
  const { expectedVersion, changeReason, ...rest } = body;
  const patch = rest as PlatformSettingsPatch;
  const container = getContainer();

  const updated = await updatePlatformSettings(
    {
      settingsRepo: container.settingsRepo,
      historyRepo: container.settingsHistoryRepo,
      auditRepo: container.auditEvents,
      outboxRepo: container.outbox,
      uow: container.uow,
    },
    {
      expectedVersion,
      patch,
      changeReason,
      actorUserId: actor.userId,
      actorRole: actor.platformRole,
      traceId,
    },
  );

  return NextResponse.json(toResponseBody(updated));
});
