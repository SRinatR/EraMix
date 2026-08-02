import type { IndicativePrice } from './indicative-price.js';
import type { LocaleCode } from './locale.js';

// Plain data shapes for Phase 1 aggregates (ADR-0001: domain entities/value
// objects only, zero framework dependency). Business-rule-bearing behaviour
// (order transitions, slug lifecycle, RBAC policy) lands in later phases;
// Phase 1 fixes the shape the schema, ports, and adapters agree on.

export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type UserStatus = 'ACTIVE' | 'DISABLED';
/** See ADR-0014 (TZ §3.1 RBAC matrix). Distinct from CompanyRole. */
export type PlatformRole = 'CUSTOMER' | 'MANAGER' | 'CONTENT_EDITOR' | 'ADMIN' | 'AUDITOR';
export type CompanyStatus = 'ACTIVE' | 'SUSPENDED';
export type CompanyRole = 'OWNER' | 'MEMBER';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'REVOKED';
export type ContentType = 'ARTICLE' | 'PAGE' | 'FAQ_ITEM';
export type ContentRouteNamespace = 'ARTICLES' | 'PAGES';
export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';
export type ProductAssetType = 'IMAGE' | 'DOCUMENT';
/** See packages/infrastructure/prisma/schema.prisma's MalwareScanStatus comment: INFECTED is never persisted in MVP (rejected before the row is created), the value exists for vocabulary completeness. */
export type MalwareScanStatus = 'CLEAN' | 'INFECTED';

/** Mirrors Prisma's OrderStatus enum (packages/infrastructure/prisma/schema.prisma). */
export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'WAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'IN_PREPARATION'
  | 'READY_FOR_PICKUP'
  | 'READY_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Versioned {
  readonly version: number;
}

export interface Timestamped {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface User extends Versioned, Timestamped {
  readonly id: string;
  readonly issuer: string;
  readonly subject: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly platformRole: PlatformRole;
}

export interface Company extends Versioned, Timestamped {
  readonly id: string;
  readonly legalName: string;
  readonly status: CompanyStatus;
  /** See docs/OPEN_QUESTIONS.md Q-09 — untyped pending a business decision. */
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface Membership extends Versioned, Timestamped {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string;
  readonly role: CompanyRole;
  readonly status: MembershipStatus;
}

export interface CategoryTranslation extends Versioned, Timestamped {
  readonly id: string;
  readonly categoryId: string;
  readonly locale: LocaleCode;
  readonly name: string;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
}

export interface CategoryRoute {
  readonly id: string;
  readonly translationId: string;
  readonly locale: LocaleCode;
  readonly slug: string;
  readonly isCanonical: boolean;
  readonly createdAt: Date;
}

export interface Category extends Versioned, Timestamped {
  readonly id: string;
  readonly parentId?: string | undefined;
  readonly status: PublicationStatus;
  readonly sortOrder: number;
  /** Durable, one-way "permanently retired" state — distinct from ARCHIVED (reversible unpublish). See packages/domain/src/retirement.ts. */
  readonly retiredAt?: Date | undefined;
  readonly retirementReason?: string | undefined;
}

export interface ProductTranslation extends Versioned, Timestamped {
  readonly id: string;
  readonly productId: string;
  readonly locale: LocaleCode;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  readonly indicativePrice?: IndicativePrice | undefined;
}

export interface Product extends Versioned, Timestamped {
  readonly id: string;
  readonly publicId: string;
  readonly sku: string;
  readonly categoryId: string;
  readonly status: PublicationStatus;
  readonly publishedAt?: Date | undefined;
  /** Durable, one-way "permanently retired" state — distinct from ARCHIVED (reversible unpublish). See packages/domain/src/retirement.ts. */
  readonly retiredAt?: Date | undefined;
  readonly retirementReason?: string | undefined;
  /**
   * Explicit opt-in for the future direct-sale/Merchant commercial mode
   * (ADR-0019) — defaults false (quote-only). A Product.Offer belonging to
   * a product where this is false is invalid at the domain-validation
   * layer, not merely excluded later by the feed generator (CLAUDE.md:
   * "an offer belonging to a quote-only product must remain excluded
   * unless the product is explicitly enabled for the direct-sale
   * commercial mode").
   */
  readonly directSaleEnabled: boolean;
}

export interface ContentTranslation extends Versioned, Timestamped {
  readonly id: string;
  readonly contentId: string;
  readonly locale: LocaleCode;
  readonly title: string;
  readonly summary?: string | undefined;
  readonly content: unknown;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
}

export interface ContentRoute {
  readonly id: string;
  readonly translationId: string;
  readonly locale: LocaleCode;
  readonly namespace: ContentRouteNamespace;
  readonly slug: string;
  readonly isCanonical: boolean;
  readonly createdAt: Date;
}

export interface Content extends Versioned, Timestamped {
  readonly id: string;
  readonly type: ContentType;
  readonly status: PublicationStatus;
  readonly publishedAt?: Date | undefined;
  /** Durable, one-way "permanently retired" state — distinct from ARCHIVED (reversible unpublish). See packages/domain/src/retirement.ts. */
  readonly retiredAt?: Date | undefined;
  readonly retirementReason?: string | undefined;
}

export interface ProductAsset extends Versioned, Timestamped {
  readonly id: string;
  readonly productId: string;
  readonly assetType: ProductAssetType;
  readonly status: PublicationStatus;
  /** Opaque, generated key — never the caller-supplied filename or a derivative of it (CLAUDE.md). */
  readonly storageKey: string;
  readonly originalFilename: string;
  readonly displayName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly locale?: LocaleCode | undefined;
  readonly altText?: string | undefined;
  readonly caption?: string | undefined;
  readonly sortOrder: number;
  readonly malwareScanStatus: MalwareScanStatus;
  readonly malwareScanEngine: string;
  readonly uploadedByUserId?: string | undefined;
}

export interface OrderLine {
  readonly id: string;
  readonly orderId: string;
  readonly productId: string;
  readonly productNameSnapshot: string;
  readonly productSkuSnapshot: string;
  readonly quantity: number;
  readonly note?: string | undefined;
}

export interface OrderStatusHistoryEntry {
  readonly id: string;
  readonly orderId: string;
  readonly fromStatus?: OrderStatus | undefined;
  readonly toStatus: OrderStatus;
  readonly actorUserId?: string | undefined;
  readonly reason?: string | undefined;
  readonly createdAt: Date;
}

/**
 * PUBLIC is visible to the ordering company's own members; INTERNAL only to
 * `order.transition` holders (manager/admin) — see
 * packages/application/src/order-comments.ts (ORD-008/ACC-004/TZ §6.6).
 */
export type CommentVisibility = 'PUBLIC' | 'INTERNAL';

export interface OrderComment {
  readonly id: string;
  readonly orderId: string;
  readonly authorId: string;
  readonly visibility: CommentVisibility;
  readonly body: string;
  readonly createdAt: Date;
}

export interface Order extends Versioned, Timestamped {
  readonly id: string;
  readonly orderNumber: string;
  readonly companyId: string;
  readonly createdByUserId: string;
  readonly status: OrderStatus;
  readonly contactName?: string | undefined;
  readonly contactPhone?: string | undefined;
  readonly contactEmail?: string | undefined;
  readonly deliveryAddress?: Record<string, unknown> | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly submittedAt?: Date | undefined;
}

export interface AuditEvent {
  readonly id: string;
  readonly actorUserId?: string | undefined;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly traceId?: string | undefined;
  readonly createdAt: Date;
}

export interface OutboxMessage {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly availableAt: Date;
  readonly lastError?: string | undefined;
}

/**
 * Product Owner / admin control-plane singleton (CLAUDE.md "Public URL and
 * localization policy" + docs/runbooks/search-visibility.md's settings
 * table). Never carries a secret value — only non-secret verification
 * tokens/IDs and boolean "configured"/"enabled" flags; real secrets (the
 * IndexNow key, any future OAuth token) live in the deployment secret store.
 */
export interface PlatformSettings {
  readonly id: 'singleton';
  readonly canonicalHost: string;
  readonly forceHttps: boolean;
  readonly stripTrailingSlash: boolean;

  readonly organizationName?: string | undefined;
  readonly organizationLegalName?: string | undefined;
  readonly organizationEmail?: string | undefined;
  readonly organizationPhone?: string | undefined;
  readonly organizationAddress?: string | undefined;
  readonly organizationSameAs?: readonly string[] | undefined;

  readonly seoDefaultTitleTemplate?: string | undefined;
  readonly seoDefaultDescriptionFallback?: string | undefined;
  readonly ogFallbackImageUrl?: string | undefined;

  readonly crawlerGlobalNoindex: boolean;
  readonly googleExtendedAllowed: boolean;
  readonly aiCompatibilityFilesEnabled: boolean;

  readonly analyticsConsentRequired: boolean;
  readonly ga4Enabled: boolean;
  readonly ga4MeasurementId?: string | undefined;
  readonly yandexMetricaEnabled: boolean;
  readonly yandexMetricaCounterId?: string | undefined;
  readonly rustAnalyticsEnabled: boolean;

  readonly searchConsoleVerificationToken?: string | undefined;
  readonly yandexWebmasterVerificationToken?: string | undefined;
  readonly bingVerificationToken?: string | undefined;
  readonly indexNowEnabled: boolean;

  readonly merchantCenterEnabled: boolean;

  readonly updatedByUserId?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** One committed change to PlatformSettings — see PlatformSettingsHistory in schema.prisma. */
export interface PlatformSettingsHistoryEntry {
  readonly id: string;
  readonly settingsId: 'singleton';
  readonly previousVersion: number;
  readonly previousSnapshot: PlatformSettings;
  readonly changeReason?: string | undefined;
  readonly changedByUserId?: string | undefined;
  readonly createdAt: Date;
}

/**
 * CLAUDE.md's named allowlist ("Google Ads, Yandex Direct, Microsoft Ads,
 * Meta, LinkedIn, TikTok and future providers") — a closed enum, not an
 * open string, so a provider can never be added by a client-supplied
 * value. "Future providers" means growing this list via a new migration,
 * never accepting an arbitrary caller-chosen name.
 */
export type AdvertisingProvider =
  'GOOGLE_ADS' | 'YANDEX_DIRECT' | 'MICROSOFT_ADS' | 'META' | 'LINKEDIN' | 'TIKTOK';

/** Consent-mode taxonomy a provider's activation is gated by (search-visibility.md's consent-aware analytics/advertising requirement). */
export type ConsentCategory = 'ANALYTICS' | 'ADVERTISING';

/**
 * Advertising-integration control-plane row (CLAUDE.md: "Admin controls
 * provider enablement, consent category, account/container/pixel
 * identifiers... credentials are secret-store references only"). One row
 * per AdvertisingProvider, seeded disabled by default — never implicitly
 * materialized for an unknown provider. `credentialSecretRef` is the *name*
 * of a deployment-secret-store entry, never a credential value; this
 * interface structurally has no field capable of carrying a script, HTML,
 * or token value (CLAUDE.md: "may never inject arbitrary vendor
 * JavaScript... expose access tokens").
 */
export interface AdvertisingProviderConfig extends Versioned, Timestamped {
  readonly id: string;
  readonly provider: AdvertisingProvider;
  readonly enabled: boolean;
  readonly consentCategory: ConsentCategory;
  readonly accountId?: string | undefined;
  readonly containerId?: string | undefined;
  readonly pixelId?: string | undefined;
  readonly credentialSecretRef?: string | undefined;
  readonly testMode: boolean;
}

/**
 * Dormant, fail-closed Merchant Offer foundation (ADR-0019) — a real,
 * versioned, effective-dated sellable-offer record, entirely separate from
 * ProductTranslation's quote-only indicative "from" price (ADR-0005). See
 * packages/domain/src/offer.ts's validateEffectiveOffer for the invariants
 * that gate a transition to PUBLISHED, and ADR-0019 for why this cannot
 * produce real Merchant output in this repository's current state.
 */
export type OfferState = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type OfferAvailability =
  'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' | 'BACKORDER' | 'DISCONTINUED';

export type TaxDisplayPolicy = 'TAX_INCLUDED' | 'TAX_EXCLUDED';

export interface Offer extends Versioned, Timestamped {
  readonly id: string;
  readonly productId: string;
  readonly state: OfferState;

  readonly sellerName: string;
  readonly sellerUrl?: string | undefined;

  readonly priceAmountMinor: number;
  /** ISO 4217, e.g. "USD". */
  readonly currency: string;
  readonly taxDisplayPolicy: TaxDisplayPolicy;

  readonly availability: OfferAvailability;
  /** Preorder/backorder ship date or restock date. */
  readonly availableFrom?: Date | undefined;
  readonly inventoryQuantity?: number | undefined;

  readonly sku: string;
  readonly gtin?: string | undefined;
  readonly mpn?: string | undefined;
  readonly brand?: string | undefined;

  /** ISO 3166-1 alpha-2 country codes. */
  readonly eligibleCountries: readonly string[];

  /** References (a URL or internal slug) to standalone delivery/return policy pages — never inline free text bundled with checkout logic. */
  readonly deliveryPolicyRef?: string | undefined;
  readonly returnPolicyRef?: string | undefined;

  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | undefined;

  /** Present only when purchasable; absent is the explicit not-yet-purchasable state (CLAUDE.md) — PUBLISHED requires this set. */
  readonly checkoutUrl?: string | undefined;
}
