import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { updateOffer, type OfferPatch } from '@eramix/application';
import type { Offer } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const nullableString = z.string().min(1).nullable().optional();
const nullableDate = z.coerce.date().nullable().optional();

/** Tri-state per field (omitted = unchanged, `null` = clear, value = set) — same idiom as /api/admin/advertising-providers/{provider} and /api/admin/settings. */
const updateSchema = z.object({
  expectedVersion: z.number().int().min(0),
  reason: z.string().min(1).max(500).optional(),
  state: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  sellerName: z.string().min(1).optional(),
  sellerUrl: nullableString,
  priceAmountMinor: z.number().int().optional(),
  currency: z.string().length(3).optional(),
  taxDisplayPolicy: z.enum(['TAX_INCLUDED', 'TAX_EXCLUDED']).optional(),
  availability: z
    .enum(['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'BACKORDER', 'DISCONTINUED'])
    .optional(),
  availableFrom: nullableDate,
  inventoryQuantity: z.number().int().min(0).nullable().optional(),
  sku: z.string().min(1).optional(),
  gtin: nullableString,
  mpn: nullableString,
  brand: nullableString,
  eligibleCountries: z.array(z.string().length(2)).optional(),
  deliveryPolicyRef: nullableString,
  returnPolicyRef: nullableString,
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: nullableDate,
  checkoutUrl: nullableString,
});

function toResponseBody(offer: Offer) {
  return {
    id: offer.id,
    productId: offer.productId,
    state: offer.state,
    sellerName: offer.sellerName,
    sellerUrl: offer.sellerUrl ?? null,
    priceAmountMinor: offer.priceAmountMinor,
    currency: offer.currency,
    taxDisplayPolicy: offer.taxDisplayPolicy,
    availability: offer.availability,
    availableFrom: offer.availableFrom?.toISOString() ?? null,
    inventoryQuantity: offer.inventoryQuantity ?? null,
    sku: offer.sku,
    gtin: offer.gtin ?? null,
    mpn: offer.mpn ?? null,
    brand: offer.brand ?? null,
    eligibleCountries: offer.eligibleCountries,
    deliveryPolicyRef: offer.deliveryPolicyRef ?? null,
    returnPolicyRef: offer.returnPolicyRef ?? null,
    effectiveFrom: offer.effectiveFrom.toISOString(),
    effectiveTo: offer.effectiveTo?.toISOString() ?? null,
    checkoutUrl: offer.checkoutUrl ?? null,
    updatedAt: offer.updatedAt.toISOString(),
    version: offer.version,
  };
}

const updateOfferHandler = withApiHandler<{ offerId: string }>(
  'admin.offers.update',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { offerId } = await params;
    const body = updateSchema.parse(await request.json());
    const { expectedVersion, reason, ...rest } = body;
    const patch = rest as OfferPatch;
    const container = getContainer();

    const updated = await updateOffer(
      {
        offerRepo: container.offers,
        productRepo: container.products,
        auditRepo: container.auditEvents,
        outboxRepo: container.outbox,
        uow: container.uow,
      },
      {
        id: offerId,
        expectedVersion,
        patch,
        reason,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json(toResponseBody(updated));
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  offerId: string;
}>({
  PATCH: updateOfferHandler,
});
