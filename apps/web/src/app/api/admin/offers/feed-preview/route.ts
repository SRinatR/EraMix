import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { buildMerchantFeedPreview, formatMerchantFeedTsv } from '@eramix/application';
import { NextResponse } from 'next/server';

/**
 * RBAC-protected, on-demand feed preview (ADR-0019/CLAUDE.md item 5: "feed
 * preview and per-offer eligibility reasons; validation errors; last
 * generation result"). Never a public route — the returned TSV is for
 * inspection only, never submitted to Google Merchant Center. There is no
 * persisted "last run": every call recomputes live against the current
 * database, which is the honest "last generation result" for an
 * on-demand-only, no-scheduled-job dormant feature.
 */
export const GET = withApiHandler('admin.offers.feedPreview', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const container = getContainer();

  const preview = await buildMerchantFeedPreview(
    {
      offerRepo: container.offers,
      productRepo: container.products,
      settingsRepo: container.settingsRepo,
    },
    actor.platformRole,
  );

  return NextResponse.json({
    generatedAt: preview.generatedAt.toISOString(),
    itemCount: preview.items.length,
    items: preview.items,
    diagnostics: preview.diagnostics,
    tsvPreview: formatMerchantFeedTsv(preview.items),
  });
});
