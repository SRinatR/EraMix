import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { createOffer, listOffers } from '@eramix/application';
import type { Offer, OfferState } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const OFFER_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const SORTS = ['createdAt_asc', 'createdAt_desc'] as const;

function parseState(value: string | null): OfferState | undefined {
  return value !== null && (OFFER_STATES as readonly string[]).includes(value)
    ? (value as OfferState)
    : undefined;
}

function parseSort(value: string | null): (typeof SORTS)[number] | undefined {
  return value !== null && (SORTS as readonly string[]).includes(value)
    ? (value as (typeof SORTS)[number])
    : undefined;
}

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

export const GET = withApiHandler('admin.offers.list', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const container = getContainer();

  const url = new URL(request.url);
  const productId = url.searchParams.get('productId');
  const state = parseState(url.searchParams.get('state'));
  const sort = parseSort(url.searchParams.get('sort'));
  const cursorParam = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');

  const { data, page } = await listOffers({ offerRepo: container.offers }, actor.platformRole, {
    ...(productId !== null ? { productId } : {}),
    ...(state !== undefined ? { state } : {}),
    ...(sort !== undefined ? { sort } : {}),
    ...(cursorParam !== null ? { cursor: cursorParam } : {}),
    ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
  });

  return NextResponse.json({ data: data.map(toResponseBody), page });
});

const createOfferSchema = z.object({
  productId: z.string().min(1),
  sellerName: z.string().min(1),
  sellerUrl: z.string().url().optional(),
  priceAmountMinor: z.number().int(),
  currency: z.string().length(3),
  taxDisplayPolicy: z.enum(['TAX_INCLUDED', 'TAX_EXCLUDED']),
  availability: z.enum(['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'BACKORDER', 'DISCONTINUED']),
  availableFrom: z.coerce.date().optional(),
  inventoryQuantity: z.number().int().min(0).optional(),
  sku: z.string().min(1),
  gtin: z.string().min(1).optional(),
  mpn: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  eligibleCountries: z.array(z.string().length(2)),
  deliveryPolicyRef: z.string().min(1).optional(),
  returnPolicyRef: z.string().min(1).optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  checkoutUrl: z.string().url().optional(),
  reason: z.string().min(1).max(500).optional(),
});

/**
 * Always creates a DRAFT (CLAUDE.md/ADR-0019: publishing is a deliberate,
 * separate, audited second step via PATCH). settings.manage is enforced
 * inside createOffer.
 */
export const POST = withApiHandler('admin.offers.create', async (request, traceId) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const body = createOfferSchema.parse(await request.json());
  const container = getContainer();

  const created = await createOffer(
    {
      offerRepo: container.offers,
      productRepo: container.products,
      auditRepo: container.auditEvents,
      outboxRepo: container.outbox,
      uow: container.uow,
    },
    {
      id: container.idGen.nextId(),
      ...body,
      actorUserId: actor.userId,
      actorRole: actor.platformRole,
      traceId,
    },
  );

  return NextResponse.json(toResponseBody(created), { status: 201 });
});
