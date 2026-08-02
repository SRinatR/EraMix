import {
  offerIneligibilityReasons,
  productUrl,
  type LocaleCode,
  type Offer,
  type OfferAvailability,
  type OfferIneligibilityReason,
  type PlatformRole,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type {
  OfferRepository,
  PlatformSettingsRepository,
  ProductRepository,
} from './repositories.js';

export type MerchantFeedDiagnosticReason =
  OfferIneligibilityReason | 'MISSING_TRANSLATION_DESCRIPTION';

export interface MerchantFeedDiagnostic {
  readonly offerId: string;
  readonly productId: string;
  readonly locale?: LocaleCode | undefined;
  readonly reasons: readonly MerchantFeedDiagnosticReason[];
}

export interface MerchantFeedItem {
  readonly id: string;
  readonly offerId: string;
  readonly productId: string;
  readonly locale: LocaleCode;
  readonly title: string;
  readonly description: string;
  readonly link: string;
  readonly priceAmountMinor: number;
  readonly currency: string;
  readonly availability: OfferAvailability;
  readonly condition: 'new';
  readonly sku: string;
  readonly gtin?: string | undefined;
  readonly mpn?: string | undefined;
  readonly brand?: string | undefined;
}

export interface MerchantFeedPreview {
  readonly generatedAt: Date;
  readonly items: readonly MerchantFeedItem[];
  readonly diagnostics: readonly MerchantFeedDiagnostic[];
}

export interface MerchantFeedDeps {
  readonly offerRepo: OfferRepository;
  readonly productRepo: ProductRepository;
  readonly settingsRepo: PlatformSettingsRepository;
}

/**
 * ADR-0019's deterministic Merchant feed generator, always computable as a
 * read-only preview (CLAUDE.md item 5's "admin operational view" — feed
 * preview + per-offer eligibility reasons) regardless of
 * PlatformSettings.merchantCenterEnabled. That flag is the separate
 * structural kill switch: its domain validator unconditionally rejects
 * `true` (packages/domain/src/platform-settings.ts), so
 * offerIneligibilityReasons() always includes MERCHANT_CENTER_DISABLED and
 * `items` is provably always empty today — every PUBLISHED offer can only
 * ever surface as a diagnostic. One item per (offer, product translation)
 * pair, sorted deterministically by id — never derives price from a
 * product's indicative "from" price (ADR-0005); every field comes from the
 * Offer row itself.
 */
export async function buildMerchantFeedPreview(
  deps: MerchantFeedDeps,
  actorRole: PlatformRole,
): Promise<MerchantFeedPreview> {
  requirePermission(actorRole, 'settings.manage');
  const now = new Date();
  const settings = await deps.settingsRepo.get();

  const items: MerchantFeedItem[] = [];
  const diagnostics: MerchantFeedDiagnostic[] = [];

  let cursor: string | undefined;
  const pageSize = 200;
  for (;;) {
    const page = await deps.offerRepo.listAll({
      limit: pageSize,
      sort: 'createdAt_asc',
      ...(cursor !== undefined ? { cursor } : {}),
    });

    for (const offer of page.data) {
      const product = await deps.productRepo.findById(offer.productId);
      if (!product) {
        diagnostics.push({
          offerId: offer.id,
          productId: offer.productId,
          reasons: ['PRODUCT_NOT_PUBLISHED'],
        });
        continue;
      }

      const reasons = offerIneligibilityReasons(
        offer,
        {
          status: product.status,
          directSaleEnabled: product.directSaleEnabled,
          retiredAt: product.retiredAt,
        },
        settings.merchantCenterEnabled,
        now,
      );
      if (reasons.length > 0) {
        diagnostics.push({ offerId: offer.id, productId: offer.productId, reasons });
        continue;
      }

      for (const translation of product.translations) {
        if (translation.description === undefined || translation.description.trim().length === 0) {
          diagnostics.push({
            offerId: offer.id,
            productId: offer.productId,
            locale: translation.locale,
            reasons: ['MISSING_TRANSLATION_DESCRIPTION'],
          });
          continue;
        }
        items.push(buildFeedItem(offer, product.publicId, translation));
      }
    }

    if (!page.page.hasMore) {
      break;
    }
    cursor = page.page.nextCursor;
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  diagnostics.sort(
    (a, b) => a.offerId.localeCompare(b.offerId) || (a.locale ?? '').localeCompare(b.locale ?? ''),
  );

  return { generatedAt: now, items, diagnostics };
}

function buildFeedItem(
  offer: Offer,
  productPublicId: string,
  translation: {
    readonly locale: LocaleCode;
    readonly name: string;
    readonly description?: string | undefined;
    readonly slug: string;
  },
): MerchantFeedItem {
  return {
    id: `${offer.sku}-${translation.locale}`,
    offerId: offer.id,
    productId: offer.productId,
    locale: translation.locale,
    title: translation.name,
    description: translation.description ?? '',
    link: productUrl({
      locale: translation.locale,
      publicId: productPublicId,
      slug: translation.slug,
    }),
    priceAmountMinor: offer.priceAmountMinor,
    currency: offer.currency,
    availability: offer.availability,
    condition: 'new',
    sku: offer.sku,
    gtin: offer.gtin,
    mpn: offer.mpn,
    brand: offer.brand,
  };
}

const TSV_HEADERS = [
  'id',
  'title',
  'description',
  'link',
  'price',
  'availability',
  'condition',
  'brand',
  'gtin',
  'mpn',
] as const;

const GOOGLE_AVAILABILITY: Record<OfferAvailability, string> = {
  IN_STOCK: 'in_stock',
  OUT_OF_STOCK: 'out_of_stock',
  PREORDER: 'preorder',
  BACKORDER: 'backorder',
  DISCONTINUED: 'out_of_stock',
};

/** Strips tabs/newlines only — never truncates or otherwise reinterprets the value (a malformed feed row is a diagnostic-worthy bug, not something to silently paper over). */
function tsvEscape(value: string): string {
  return value.replaceAll(/[\t\r\n]/g, ' ');
}

/**
 * Google Merchant Center's tab-separated primary feed format (CLAUDE.md item
 * 4: "deterministic Merchant feed generator"). Column order is fixed;
 * `items` must already be in the caller's desired (deterministic) order —
 * buildMerchantFeedPreview() sorts by `id`. This function is never wired to
 * a public route; it exists only for the RBAC-protected admin preview.
 */
export function formatMerchantFeedTsv(items: readonly MerchantFeedItem[]): string {
  const rows = items.map((item) =>
    [
      item.id,
      item.title,
      item.description,
      item.link,
      `${(item.priceAmountMinor / 100).toFixed(2)} ${item.currency}`,
      GOOGLE_AVAILABILITY[item.availability],
      item.condition,
      item.brand ?? '',
      item.gtin ?? '',
      item.mpn ?? '',
    ]
      .map(tsvEscape)
      .join('\t'),
  );
  return [TSV_HEADERS.join('\t'), ...rows].join('\n');
}

const SCHEMA_AVAILABILITY: Record<OfferAvailability, string> = {
  IN_STOCK: 'https://schema.org/InStock',
  OUT_OF_STOCK: 'https://schema.org/OutOfStock',
  PREORDER: 'https://schema.org/PreOrder',
  BACKORDER: 'https://schema.org/BackOrder',
  DISCONTINUED: 'https://schema.org/Discontinued',
};

export interface ProductOfferJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Product';
  readonly name: string;
  readonly description?: string;
  readonly sku: string;
  readonly gtin?: string;
  readonly mpn?: string;
  readonly brand?: { readonly '@type': 'Brand'; readonly name: string };
  readonly offers?: {
    readonly '@type': 'Offer';
    readonly price: string;
    readonly priceCurrency: string;
    readonly availability: string;
    readonly url: string;
    readonly itemCondition: string;
  };
}

/**
 * CLAUDE.md: "Product/Merchant JSON-LD generator" — factual Product
 * identity is always present (name, sku, gtin/mpn/brand where set); the
 * `offers` block is included only when `eligible` is true (the caller must
 * derive this from offerIneligibilityReasons()). Never wired into public
 * product pages while the offer/feed foundation stays dormant (ADR-0019).
 */
export function buildProductOfferJsonLd(
  productName: string,
  productDescription: string | undefined,
  offer: Offer,
  canonicalUrl: string,
  eligible: boolean,
): ProductOfferJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productName,
    ...(productDescription !== undefined ? { description: productDescription } : {}),
    sku: offer.sku,
    ...(offer.gtin !== undefined ? { gtin: offer.gtin } : {}),
    ...(offer.mpn !== undefined ? { mpn: offer.mpn } : {}),
    ...(offer.brand !== undefined
      ? { brand: { '@type': 'Brand' as const, name: offer.brand } }
      : {}),
    ...(eligible
      ? {
          offers: {
            '@type': 'Offer' as const,
            price: (offer.priceAmountMinor / 100).toFixed(2),
            priceCurrency: offer.currency,
            availability: SCHEMA_AVAILABILITY[offer.availability],
            url: canonicalUrl,
            itemCondition: 'https://schema.org/NewCondition',
          },
        }
      : {}),
  };
}
