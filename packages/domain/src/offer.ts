import { ValidationFailedError } from './errors.js';
import type { Offer } from './entities.js';

// No `URL` global here (packages/domain has no DOM/Node lib — same
// convention as platform-settings.ts's HTTPS_URL_PATTERN/indexnow.ts).
const HTTPS_URL_PATTERN = /^https:\/\/[^\s]+$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export interface OfferValidationContext {
  /** The parent Product's directSaleEnabled flag (ADR-0019) — a cross-aggregate fact this module cannot know on its own. */
  readonly productDirectSaleEnabled: boolean;
}

/**
 * Pure, framework-free validation for the *effective* Offer state a write
 * would produce (current row merged with the caller's patch — same
 * "see the merged value, not just the raw patch" convention as
 * validateEffectivePlatformSettings/validateEffectiveAdvertisingProviderConfig).
 *
 * Structurally never derives a price from ProductTranslation's indicative
 * "from" price (ADR-0005) — `priceAmountMinor` only ever comes from an
 * explicit admin write; this module has no ProductTranslation dependency
 * at all.
 */
export function validateEffectiveOffer(
  effective: Offer,
  context: OfferValidationContext,
  now: Date,
): void {
  if (effective.priceAmountMinor <= 0) {
    throw new ValidationFailedError('Offer priceAmountMinor must be a positive integer.', {
      offerId: effective.id,
      priceAmountMinor: effective.priceAmountMinor,
    });
  }
  if (!CURRENCY_PATTERN.test(effective.currency)) {
    throw new ValidationFailedError('Offer currency must be a 3-letter uppercase ISO 4217 code.', {
      offerId: effective.id,
      currency: effective.currency,
    });
  }
  if (effective.sellerName.trim().length === 0) {
    throw new ValidationFailedError('Offer sellerName must not be blank.', {
      offerId: effective.id,
    });
  }
  if (effective.sku.trim().length === 0) {
    throw new ValidationFailedError('Offer sku must not be blank.', { offerId: effective.id });
  }
  if (effective.inventoryQuantity !== undefined && effective.inventoryQuantity < 0) {
    throw new ValidationFailedError('Offer inventoryQuantity must not be negative.', {
      offerId: effective.id,
      inventoryQuantity: effective.inventoryQuantity,
    });
  }

  // No contradictory stock/availability state (CLAUDE.md) — the
  // application-layer half of the same guarantee migration
  // 20260803180000_add_offer_foundation's offer_availability_stock_consistency
  // CHECK constraint enforces at the data layer.
  if (
    effective.availability === 'OUT_OF_STOCK' &&
    effective.inventoryQuantity !== undefined &&
    effective.inventoryQuantity !== 0
  ) {
    throw new ValidationFailedError(
      'Offer availability is OUT_OF_STOCK but inventoryQuantity is not zero.',
      { offerId: effective.id, inventoryQuantity: effective.inventoryQuantity },
    );
  }
  if (
    effective.availability === 'IN_STOCK' &&
    effective.inventoryQuantity !== undefined &&
    effective.inventoryQuantity <= 0
  ) {
    throw new ValidationFailedError(
      'Offer availability is IN_STOCK but inventoryQuantity is not positive.',
      { offerId: effective.id, inventoryQuantity: effective.inventoryQuantity },
    );
  }
  if (
    (effective.availability === 'PREORDER' || effective.availability === 'BACKORDER') &&
    effective.availableFrom === undefined
  ) {
    throw new ValidationFailedError(
      `Offer availability ${effective.availability} requires availableFrom to be set.`,
      { offerId: effective.id },
    );
  }

  // No expired offer (write-time half — the "currently past effectiveTo"
  // check is the feed generator's ongoing eligibility concern, not a
  // one-time write-time check, since a PUBLISHED offer's effectiveTo can
  // pass while nothing else about the row changes).
  if (effective.effectiveTo !== undefined && effective.effectiveTo <= effective.effectiveFrom) {
    throw new ValidationFailedError('Offer effectiveTo must be strictly after effectiveFrom.', {
      offerId: effective.id,
      effectiveFrom: effective.effectiveFrom,
      effectiveTo: effective.effectiveTo,
    });
  }

  if (effective.state !== 'PUBLISHED') {
    return;
  }

  // Everything below is the "no published/syndicatable offer without..."
  // requirement (CLAUDE.md) — only gated on a transition *into* PUBLISHED,
  // mirroring publication.ts's assertCategoryPublishable/
  // assertContentPublishable/assertProductPublishable convention (never
  // gates a transition out of PUBLISHED, an editor must always be able to
  // unpublish).
  if (!context.productDirectSaleEnabled) {
    throw new ValidationFailedError(
      'An offer cannot be published for a product that is not enabled for direct-sale mode.',
      { offerId: effective.id, productId: effective.productId },
    );
  }
  if (effective.checkoutUrl === undefined) {
    throw new ValidationFailedError(
      'A published offer requires a real checkoutUrl (or it must stay DRAFT — the explicit not-yet-purchasable state).',
      { offerId: effective.id },
    );
  }
  if (!HTTPS_URL_PATTERN.test(effective.checkoutUrl)) {
    throw new ValidationFailedError('Offer checkoutUrl must be an absolute https URL.', {
      offerId: effective.id,
      checkoutUrl: effective.checkoutUrl,
    });
  }
  if (effective.deliveryPolicyRef === undefined || effective.returnPolicyRef === undefined) {
    throw new ValidationFailedError(
      'A published offer requires both deliveryPolicyRef and returnPolicyRef.',
      { offerId: effective.id },
    );
  }
  if (effective.eligibleCountries.length === 0) {
    throw new ValidationFailedError('A published offer requires at least one eligible country.', {
      offerId: effective.id,
    });
  }
  for (const country of effective.eligibleCountries) {
    if (!COUNTRY_CODE_PATTERN.test(country)) {
      throw new ValidationFailedError(
        `Offer eligibleCountries entry "${country}" is not a 2-letter uppercase ISO 3166-1 alpha-2 code.`,
        { offerId: effective.id, country },
      );
    }
  }
  if (effective.effectiveTo !== undefined && effective.effectiveTo <= now) {
    throw new ValidationFailedError('A published offer must not already be expired.', {
      offerId: effective.id,
      effectiveTo: effective.effectiveTo,
    });
  }
}

/**
 * Feed/JSON-LD-generation-time eligibility (CLAUDE.md: "exclude drafts,
 * invalid, expired, quote-only and unavailable products"). Distinct from
 * write-time validation: a currently-ineligible offer is not an error, it
 * is simply excluded from output, with a reason for the admin operational
 * view (CLAUDE.md: "per-offer eligibility reasons").
 */
export type OfferIneligibilityReason =
  | 'NOT_PUBLISHED'
  | 'PRODUCT_NOT_DIRECT_SALE_ENABLED'
  | 'PRODUCT_RETIRED'
  | 'PRODUCT_NOT_PUBLISHED'
  | 'EXPIRED'
  | 'NOT_YET_EFFECTIVE'
  | 'DISCONTINUED'
  | 'MERCHANT_CENTER_DISABLED';

export function offerIneligibilityReasons(
  offer: Offer,
  product: {
    readonly status: string;
    readonly directSaleEnabled: boolean;
    readonly retiredAt?: Date | undefined;
  },
  merchantCenterEnabled: boolean,
  now: Date,
): readonly OfferIneligibilityReason[] {
  const reasons: OfferIneligibilityReason[] = [];
  if (!merchantCenterEnabled) {
    reasons.push('MERCHANT_CENTER_DISABLED');
  }
  if (offer.state !== 'PUBLISHED') {
    reasons.push('NOT_PUBLISHED');
  }
  if (!product.directSaleEnabled) {
    reasons.push('PRODUCT_NOT_DIRECT_SALE_ENABLED');
  }
  if (product.retiredAt !== undefined) {
    reasons.push('PRODUCT_RETIRED');
  }
  if (product.status !== 'PUBLISHED') {
    reasons.push('PRODUCT_NOT_PUBLISHED');
  }
  if (offer.effectiveFrom > now) {
    reasons.push('NOT_YET_EFFECTIVE');
  }
  if (offer.effectiveTo !== undefined && offer.effectiveTo <= now) {
    reasons.push('EXPIRED');
  }
  if (offer.availability === 'DISCONTINUED') {
    reasons.push('DISCONTINUED');
  }
  return reasons;
}
