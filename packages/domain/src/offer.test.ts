import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { offerIneligibilityReasons, validateEffectiveOffer } from './offer.js';
import type { Offer } from './entities.js';

const NOW = new Date('2026-08-03T12:00:00Z');
const DIRECT_SALE_ENABLED = { productDirectSaleEnabled: true };
const DIRECT_SALE_DISABLED = { productDirectSaleEnabled: false };

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'offer-1',
    productId: 'product-1',
    state: 'DRAFT',
    sellerName: 'EraMix LLC',
    priceAmountMinor: 15_000,
    currency: 'USD',
    taxDisplayPolicy: 'TAX_EXCLUDED',
    availability: 'IN_STOCK',
    inventoryQuantity: 10,
    sku: 'SKU-1',
    eligibleCountries: ['US', 'CA'],
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    createdAt: NOW,
    updatedAt: NOW,
    version: 0,
    ...overrides,
  };
}

function publishableOffer(overrides: Partial<Offer> = {}): Offer {
  return makeOffer({
    state: 'PUBLISHED',
    checkoutUrl: 'https://eramix.example/checkout/offer-1',
    deliveryPolicyRef: 'https://eramix.example/delivery-policy',
    returnPolicyRef: 'https://eramix.example/return-policy',
    ...overrides,
  });
}

describe('validateEffectiveOffer', () => {
  it('accepts a well-formed DRAFT offer with no checkout URL (the explicit not-yet-purchasable state)', () => {
    expect(() => validateEffectiveOffer(makeOffer(), DIRECT_SALE_DISABLED, NOW)).not.toThrow();
  });

  it('accepts a well-formed PUBLISHED offer when every precondition is met', () => {
    expect(() =>
      validateEffectiveOffer(publishableOffer(), DIRECT_SALE_ENABLED, NOW),
    ).not.toThrow();
  });

  it('rejects a non-positive price', () => {
    expect(() =>
      validateEffectiveOffer(makeOffer({ priceAmountMinor: 0 }), DIRECT_SALE_DISABLED, NOW),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a malformed currency code', () => {
    expect(() =>
      validateEffectiveOffer(makeOffer({ currency: 'usd' }), DIRECT_SALE_DISABLED, NOW),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a blank sellerName', () => {
    expect(() =>
      validateEffectiveOffer(makeOffer({ sellerName: '   ' }), DIRECT_SALE_DISABLED, NOW),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a blank sku', () => {
    expect(() => validateEffectiveOffer(makeOffer({ sku: '' }), DIRECT_SALE_DISABLED, NOW)).toThrow(
      ValidationFailedError,
    );
  });

  it('rejects a negative inventoryQuantity', () => {
    expect(() =>
      validateEffectiveOffer(makeOffer({ inventoryQuantity: -1 }), DIRECT_SALE_DISABLED, NOW),
    ).toThrow(ValidationFailedError);
  });

  describe('no contradictory stock/availability state', () => {
    it('rejects OUT_OF_STOCK with a positive inventoryQuantity', () => {
      expect(() =>
        validateEffectiveOffer(
          makeOffer({ availability: 'OUT_OF_STOCK', inventoryQuantity: 5 }),
          DIRECT_SALE_DISABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects IN_STOCK with a zero inventoryQuantity', () => {
      expect(() =>
        validateEffectiveOffer(
          makeOffer({ availability: 'IN_STOCK', inventoryQuantity: 0 }),
          DIRECT_SALE_DISABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects PREORDER without availableFrom', () => {
      expect(() =>
        validateEffectiveOffer(
          makeOffer({ availability: 'PREORDER', inventoryQuantity: undefined }),
          DIRECT_SALE_DISABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('accepts PREORDER with availableFrom set', () => {
      expect(() =>
        validateEffectiveOffer(
          makeOffer({
            availability: 'PREORDER',
            inventoryQuantity: undefined,
            availableFrom: new Date('2026-09-01T00:00:00Z'),
          }),
          DIRECT_SALE_DISABLED,
          NOW,
        ),
      ).not.toThrow();
    });
  });

  it('rejects effectiveTo not strictly after effectiveFrom', () => {
    expect(() =>
      validateEffectiveOffer(
        makeOffer({
          effectiveFrom: new Date('2026-08-01T00:00:00Z'),
          effectiveTo: new Date('2026-08-01T00:00:00Z'),
        }),
        DIRECT_SALE_DISABLED,
        NOW,
      ),
    ).toThrow(ValidationFailedError);
  });

  describe('PUBLISHED preconditions ("no published/syndicatable offer without...")', () => {
    it('rejects publishing when the parent product is not direct-sale enabled', () => {
      expect(() => validateEffectiveOffer(publishableOffer(), DIRECT_SALE_DISABLED, NOW)).toThrow(
        ValidationFailedError,
      );
    });

    it('rejects publishing without a checkoutUrl', () => {
      expect(() =>
        validateEffectiveOffer(
          publishableOffer({ checkoutUrl: undefined }),
          DIRECT_SALE_ENABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects a non-https checkoutUrl', () => {
      expect(() =>
        validateEffectiveOffer(
          publishableOffer({ checkoutUrl: 'http://eramix.example/checkout' }),
          DIRECT_SALE_ENABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects publishing without a deliveryPolicyRef', () => {
      expect(() =>
        validateEffectiveOffer(
          publishableOffer({ deliveryPolicyRef: undefined }),
          DIRECT_SALE_ENABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects publishing without a returnPolicyRef', () => {
      expect(() =>
        validateEffectiveOffer(
          publishableOffer({ returnPolicyRef: undefined }),
          DIRECT_SALE_ENABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects publishing with no eligible countries', () => {
      expect(() =>
        validateEffectiveOffer(
          publishableOffer({ eligibleCountries: [] }),
          DIRECT_SALE_ENABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects a malformed country code', () => {
      expect(() =>
        validateEffectiveOffer(
          publishableOffer({ eligibleCountries: ['USA'] }),
          DIRECT_SALE_ENABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('rejects publishing an already-expired offer', () => {
      expect(() =>
        validateEffectiveOffer(
          publishableOffer({ effectiveTo: new Date('2026-08-01T00:00:00Z') }),
          DIRECT_SALE_ENABLED,
          NOW,
        ),
      ).toThrow(ValidationFailedError);
    });

    it('never gates a transition out of PUBLISHED (an editor must always be able to unpublish)', () => {
      // ARCHIVED with none of the PUBLISHED preconditions met must still pass.
      expect(() =>
        validateEffectiveOffer(makeOffer({ state: 'ARCHIVED' }), DIRECT_SALE_DISABLED, NOW),
      ).not.toThrow();
    });
  });
});

describe('offerIneligibilityReasons', () => {
  const eligibleProduct = { status: 'PUBLISHED', directSaleEnabled: true };

  it('returns no reasons for a fully eligible offer when Merchant Center is enabled', () => {
    const reasons = offerIneligibilityReasons(publishableOffer(), eligibleProduct, true, NOW);
    expect(reasons).toEqual([]);
  });

  it('always includes MERCHANT_CENTER_DISABLED while the kill switch is off (the default, dormant state)', () => {
    const reasons = offerIneligibilityReasons(publishableOffer(), eligibleProduct, false, NOW);
    expect(reasons).toContain('MERCHANT_CENTER_DISABLED');
  });

  it('flags a DRAFT offer as NOT_PUBLISHED', () => {
    const reasons = offerIneligibilityReasons(makeOffer(), eligibleProduct, true, NOW);
    expect(reasons).toContain('NOT_PUBLISHED');
  });

  it('flags a quote-only product as PRODUCT_NOT_DIRECT_SALE_ENABLED', () => {
    const reasons = offerIneligibilityReasons(
      publishableOffer(),
      { status: 'PUBLISHED', directSaleEnabled: false },
      true,
      NOW,
    );
    expect(reasons).toContain('PRODUCT_NOT_DIRECT_SALE_ENABLED');
  });

  it('flags a retired product as PRODUCT_RETIRED', () => {
    const reasons = offerIneligibilityReasons(
      publishableOffer(),
      { status: 'ARCHIVED', directSaleEnabled: true, retiredAt: NOW },
      true,
      NOW,
    );
    expect(reasons).toContain('PRODUCT_RETIRED');
  });

  it('flags an expired offer as EXPIRED', () => {
    const reasons = offerIneligibilityReasons(
      publishableOffer({ effectiveTo: new Date('2026-08-01T00:00:00Z') }),
      eligibleProduct,
      true,
      NOW,
    );
    expect(reasons).toContain('EXPIRED');
  });

  it('flags a not-yet-effective offer as NOT_YET_EFFECTIVE', () => {
    const reasons = offerIneligibilityReasons(
      publishableOffer({ effectiveFrom: new Date('2027-01-01T00:00:00Z') }),
      eligibleProduct,
      true,
      NOW,
    );
    expect(reasons).toContain('NOT_YET_EFFECTIVE');
  });

  it('flags a discontinued offer as DISCONTINUED', () => {
    const reasons = offerIneligibilityReasons(
      publishableOffer({ availability: 'DISCONTINUED' }),
      eligibleProduct,
      true,
      NOW,
    );
    expect(reasons).toContain('DISCONTINUED');
  });
});
