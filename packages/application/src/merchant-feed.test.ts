import { AccessDeniedError } from '@eramix/domain';
import type { Offer, PlatformSettings, Product, ProductTranslation } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import type {
  OfferRepository,
  PlatformSettingsRepository,
  ProductRepository,
} from './repositories.js';
import {
  buildMerchantFeedPreview,
  buildProductOfferJsonLd,
  formatMerchantFeedTsv,
  type MerchantFeedItem,
} from './merchant-feed.js';

function makeProduct(
  overrides: Partial<Product> = {},
  translations: ProductTranslation[] = [],
): Product & { translations: ProductTranslation[] } {
  return {
    id: 'product-1',
    publicId: 'P8K4F2M9',
    sku: 'SKU-1',
    categoryId: 'category-1',
    status: 'PUBLISHED',
    directSaleEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations,
    ...overrides,
  };
}

function makeTranslation(overrides: Partial<ProductTranslation> = {}): ProductTranslation {
  return {
    id: 'translation-1',
    productId: 'product-1',
    locale: 'en',
    name: 'Widget',
    slug: 'widget',
    description: 'A very fine widget.',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'offer-1',
    productId: 'product-1',
    state: 'PUBLISHED',
    sellerName: 'EraMix LLC',
    priceAmountMinor: 15_000,
    currency: 'USD',
    taxDisplayPolicy: 'TAX_EXCLUDED',
    availability: 'IN_STOCK',
    inventoryQuantity: 10,
    sku: 'SKU-1',
    eligibleCountries: ['US'],
    effectiveFrom: new Date('2020-01-01T00:00:00Z'),
    checkoutUrl: 'https://eramix.example/checkout',
    deliveryPolicyRef: 'https://eramix.example/delivery',
    returnPolicyRef: 'https://eramix.example/returns',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    id: 'singleton',
    canonicalHost: 'eramix.example',
    forceHttps: true,
    stripTrailingSlash: true,
    crawlerGlobalNoindex: false,
    googleExtendedAllowed: true,
    aiCompatibilityFilesEnabled: false,
    analyticsConsentRequired: true,
    ga4Enabled: false,
    yandexMetricaEnabled: false,
    rustAnalyticsEnabled: false,
    indexNowEnabled: false,
    merchantCenterEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

function offerRepoOf(offers: readonly Offer[]): OfferRepository {
  return {
    listAll: () => Promise.resolve({ data: offers, page: { hasMore: false } }),
  } as unknown as OfferRepository;
}

function productRepoOf(
  products: ReadonlyMap<string, Product & { translations: ProductTranslation[] }>,
): ProductRepository {
  return {
    findById: (id: string) => Promise.resolve(products.get(id)),
  } as unknown as ProductRepository;
}

function settingsRepoOf(settings: PlatformSettings): PlatformSettingsRepository {
  return { get: () => Promise.resolve(settings) } as unknown as PlatformSettingsRepository;
}

describe('buildMerchantFeedPreview', () => {
  it('denies a MANAGER (no settings.manage permission)', async () => {
    await expect(
      buildMerchantFeedPreview(
        {
          offerRepo: offerRepoOf([]),
          productRepo: productRepoOf(new Map()),
          settingsRepo: settingsRepoOf(makeSettings()),
        },
        'MANAGER',
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('is provably always empty while merchantCenterEnabled stays hard-false, even for an otherwise fully eligible offer', async () => {
    const product = makeProduct({}, [makeTranslation()]);
    const offer = makeOffer();

    const preview = await buildMerchantFeedPreview(
      {
        offerRepo: offerRepoOf([offer]),
        productRepo: productRepoOf(new Map([[product.id, product]])),
        settingsRepo: settingsRepoOf(makeSettings({ merchantCenterEnabled: false })),
      },
      'ADMIN',
    );

    expect(preview.items).toHaveLength(0);
    expect(preview.diagnostics).toHaveLength(1);
    expect(preview.diagnostics[0]?.reasons).toContain('MERCHANT_CENTER_DISABLED');
  });

  it('produces a deterministic item once every eligibility condition is met (hypothetical: merchantCenterEnabled true)', async () => {
    const product = makeProduct({}, [makeTranslation()]);
    const offer = makeOffer();

    const preview = await buildMerchantFeedPreview(
      {
        offerRepo: offerRepoOf([offer]),
        productRepo: productRepoOf(new Map([[product.id, product]])),
        settingsRepo: settingsRepoOf(makeSettings({ merchantCenterEnabled: true })),
      },
      'ADMIN',
    );

    expect(preview.diagnostics).toHaveLength(0);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({
      id: 'SKU-1-en',
      offerId: 'offer-1',
      locale: 'en',
      title: 'Widget',
      link: '/en/catalog/P8K4F2M9-widget',
      priceAmountMinor: 15_000,
      currency: 'USD',
    });
  });

  it('excludes a quote-only (not direct-sale-enabled) product even when merchantCenterEnabled is hypothetically true', async () => {
    const product = makeProduct({ directSaleEnabled: false }, [makeTranslation()]);
    const offer = makeOffer();

    const preview = await buildMerchantFeedPreview(
      {
        offerRepo: offerRepoOf([offer]),
        productRepo: productRepoOf(new Map([[product.id, product]])),
        settingsRepo: settingsRepoOf(makeSettings({ merchantCenterEnabled: true })),
      },
      'ADMIN',
    );

    expect(preview.items).toHaveLength(0);
    expect(preview.diagnostics[0]?.reasons).toContain('PRODUCT_NOT_DIRECT_SALE_ENABLED');
  });

  it('fails closed per translation: a missing description excludes only that locale, not the whole offer', async () => {
    const product = makeProduct({}, [
      makeTranslation({ locale: 'en', description: 'A very fine widget.' }),
      makeTranslation({ id: 'translation-2', locale: 'ru', description: undefined }),
    ]);
    const offer = makeOffer();

    const preview = await buildMerchantFeedPreview(
      {
        offerRepo: offerRepoOf([offer]),
        productRepo: productRepoOf(new Map([[product.id, product]])),
        settingsRepo: settingsRepoOf(makeSettings({ merchantCenterEnabled: true })),
      },
      'ADMIN',
    );

    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.locale).toBe('en');
    expect(preview.diagnostics).toHaveLength(1);
    expect(preview.diagnostics[0]).toMatchObject({
      locale: 'ru',
      reasons: ['MISSING_TRANSLATION_DESCRIPTION'],
    });
  });

  it('sorts items deterministically by id regardless of repository return order', async () => {
    const productB = makeProduct({ id: 'product-b', publicId: 'PBBBBBBB' }, [
      makeTranslation({ productId: 'product-b', locale: 'en', slug: 'b-widget' }),
    ]);
    const productA = makeProduct({ id: 'product-a', publicId: 'PAAAAAAA' }, [
      makeTranslation({ productId: 'product-a', locale: 'en', slug: 'a-widget' }),
    ]);
    const offerB = makeOffer({ id: 'offer-b', productId: 'product-b', sku: 'SKU-B' });
    const offerA = makeOffer({ id: 'offer-a', productId: 'product-a', sku: 'SKU-A' });

    const preview = await buildMerchantFeedPreview(
      {
        offerRepo: offerRepoOf([offerB, offerA]),
        productRepo: productRepoOf(
          new Map([
            [productB.id, productB],
            [productA.id, productA],
          ]),
        ),
        settingsRepo: settingsRepoOf(makeSettings({ merchantCenterEnabled: true })),
      },
      'ADMIN',
    );

    expect(preview.items.map((item) => item.id)).toEqual(['SKU-A-en', 'SKU-B-en']);
  });
});

describe('formatMerchantFeedTsv', () => {
  const item: MerchantFeedItem = {
    id: 'SKU-1-en',
    offerId: 'offer-1',
    productId: 'product-1',
    locale: 'en',
    title: 'Widget',
    description: 'A very fine widget.',
    link: '/en/catalog/P8K4F2M9-widget',
    priceAmountMinor: 15_000,
    currency: 'USD',
    availability: 'IN_STOCK',
    condition: 'new',
    sku: 'SKU-1',
  };

  it('emits a header row plus one tab-separated row per item, in the given order', () => {
    const tsv = formatMerchantFeedTsv([item]);
    const lines = tsv.split('\n');
    expect(lines[0]).toBe(
      'id\ttitle\tdescription\tlink\tprice\tavailability\tcondition\tbrand\tgtin\tmpn',
    );
    expect(lines[1]).toBe(
      'SKU-1-en\tWidget\tA very fine widget.\t/en/catalog/P8K4F2M9-widget\t150.00 USD\tin_stock\tnew\t\t\t',
    );
  });

  it('escapes embedded tabs/newlines so a malformed field can never break column alignment', () => {
    const tsv = formatMerchantFeedTsv([{ ...item, description: 'Line one\nLine\ttwo' }]);
    expect(tsv.split('\n')).toHaveLength(2);
    expect(tsv).toContain('Line one Line two');
  });
});

describe('buildProductOfferJsonLd', () => {
  it('omits the offers block when not eligible, but always includes factual product identity', () => {
    const offer = makeOffer();
    const jsonLd = buildProductOfferJsonLd(
      'Widget',
      'A very fine widget.',
      offer,
      '/en/catalog/x',
      false,
    );
    expect(jsonLd.offers).toBeUndefined();
    expect(jsonLd).toMatchObject({ '@type': 'Product', name: 'Widget', sku: 'SKU-1' });
  });

  it('includes a schema.org Offer block only when eligible, with the mapped availability URL', () => {
    const offer = makeOffer({ availability: 'PREORDER' });
    const jsonLd = buildProductOfferJsonLd(
      'Widget',
      'A very fine widget.',
      offer,
      '/en/catalog/x',
      true,
    );
    expect(jsonLd.offers).toMatchObject({
      price: '150.00',
      priceCurrency: 'USD',
      availability: 'https://schema.org/PreOrder',
      url: '/en/catalog/x',
    });
  });
});
