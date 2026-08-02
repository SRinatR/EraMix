import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import {
  buildPlatformSettingsPreview,
  getPlatformSettings,
  requirePermission,
  type PlatformSettingsPatch,
} from '@eramix/application';
import { validateEffectivePlatformSettings, type PlatformSettings } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const nullableString = z.string().min(1).nullable().optional();

/** Same tri-state patch shape as PATCH /api/admin/settings, minus expectedVersion/changeReason — this endpoint never writes anything. */
const previewPatchSchema = z.object({
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
  ogFallbackImageUrl: z.string().url().nullable().optional(),
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

/**
 * Read-only "effective output" preview (search-visibility.md: "the UI
 * previews effective metadata/JSON-LD/sitemap/redirect/hreflang output").
 * GET previews the currently-saved settings; POST previews a hypothetical
 * patch *before* it is ever persisted — neither ever writes.
 */
export const GET = withApiHandler('admin.settings.preview.current', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'settings.manage');

  const container = getContainer();
  const settings = await getPlatformSettings({ settingsRepo: container.settingsRepo });
  return NextResponse.json(buildPlatformSettingsPreview(settings));
});

export const POST = withApiHandler('admin.settings.preview.hypothetical', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'settings.manage');

  const patch = previewPatchSchema.parse(await request.json()) as PlatformSettingsPatch;
  const container = getContainer();
  const current = await getPlatformSettings({ settingsRepo: container.settingsRepo });
  const effective = mergePatch(current, patch);
  validateEffectivePlatformSettings(effective);
  return NextResponse.json(buildPlatformSettingsPreview(effective));
});
