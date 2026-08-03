import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { getOfferEligibility } from '@eramix/application';
import { NextResponse } from 'next/server';

/**
 * CLAUDE.md item 5: "per-offer eligibility reasons" for the admin
 * operational view — read-only, always includes MERCHANT_CENTER_DISABLED
 * while PlatformSettings.merchantCenterEnabled stays hard-false (ADR-0019).
 */
const getHandler = withApiHandler<{ offerId: string }>(
  'admin.offers.eligibility',
  async (request, _traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { offerId } = await params;
    const container = getContainer();

    const result = await getOfferEligibility(
      {
        offerRepo: container.offers,
        productRepo: container.products,
        settingsRepo: container.settingsRepo,
      },
      offerId,
      actor.platformRole,
    );

    return NextResponse.json({
      offerId: result.offer.id,
      eligible: result.eligible,
      ineligibilityReasons: result.ineligibilityReasons,
    });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{ offerId: string }>({
  GET: getHandler,
});
