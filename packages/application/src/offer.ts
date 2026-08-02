import {
  ResourceNotFoundError,
  validateEffectiveOffer,
  offerIneligibilityReasons,
  type Offer,
  type OfferIneligibilityReason,
  type PlatformRole,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { UnitOfWork } from './ports.js';
import type {
  AuditEventRepository,
  OfferPatch,
  OfferRepository,
  OutboxMessageRepository,
  PlatformSettingsRepository,
  ProductRepository,
  ProductWithTranslations,
} from './repositories.js';
import type { CursorPage, CursorPaginationInput } from './pagination.js';
import type { OfferListFilter } from './repositories.js';

/**
 * Dormant Merchant Offer control plane (ADR-0019). `settings.manage` — the
 * same ADMIN-only permission PlatformSettings/advertising already use,
 * matching search-visibility.md's "Product Owner only" ownership for
 * Merchant-Center-adjacent controls. Every write validates the *effective*
 * (current merged with patch) state, in one transaction with the audit/
 * outbox rows — an invalid patch never reaches the database.
 */

export interface OfferDeps {
  readonly offerRepo: OfferRepository;
  readonly productRepo: ProductRepository;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
}

async function requireProduct(
  productRepo: ProductRepository,
  productId: string,
): Promise<ProductWithTranslations> {
  const product = await productRepo.findById(productId);
  if (!product) {
    throw new ResourceNotFoundError(`Product ${productId} not found.`, { productId });
  }
  return product;
}

export interface CreateOfferInput {
  readonly id: string;
  readonly productId: string;
  readonly sellerName: string;
  readonly sellerUrl?: string | undefined;
  readonly priceAmountMinor: number;
  readonly currency: string;
  readonly taxDisplayPolicy: Offer['taxDisplayPolicy'];
  readonly availability: Offer['availability'];
  readonly availableFrom?: Date | undefined;
  readonly inventoryQuantity?: number | undefined;
  readonly sku: string;
  readonly gtin?: string | undefined;
  readonly mpn?: string | undefined;
  readonly brand?: string | undefined;
  readonly eligibleCountries: readonly string[];
  readonly deliveryPolicyRef?: string | undefined;
  readonly returnPolicyRef?: string | undefined;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | undefined;
  readonly checkoutUrl?: string | undefined;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly reason?: string | undefined;
  readonly traceId?: string | undefined;
}

/** Always created DRAFT — publishing is a deliberate, separate, audited second step (updateOffer with state: 'PUBLISHED'), never a side effect of creation. */
export async function createOffer(deps: OfferDeps, input: CreateOfferInput): Promise<Offer> {
  requirePermission(input.actorRole, 'settings.manage');
  return deps.uow.runInTransaction(async () => {
    const product = await requireProduct(deps.productRepo, input.productId);

    const draft: Offer = {
      id: input.id,
      productId: input.productId,
      state: 'DRAFT',
      sellerName: input.sellerName,
      sellerUrl: input.sellerUrl,
      priceAmountMinor: input.priceAmountMinor,
      currency: input.currency,
      taxDisplayPolicy: input.taxDisplayPolicy,
      availability: input.availability,
      availableFrom: input.availableFrom,
      inventoryQuantity: input.inventoryQuantity,
      sku: input.sku,
      gtin: input.gtin,
      mpn: input.mpn,
      brand: input.brand,
      eligibleCountries: input.eligibleCountries,
      deliveryPolicyRef: input.deliveryPolicyRef,
      returnPolicyRef: input.returnPolicyRef,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      checkoutUrl: input.checkoutUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
    };
    validateEffectiveOffer(
      draft,
      { productDirectSaleEnabled: product.directSaleEnabled },
      new Date(),
    );

    const created = await deps.offerRepo.create(draft);
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'offer.created',
      entityType: 'Offer',
      entityId: created.id,
      metadata: { productId: input.productId, reason: input.reason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Offer',
      aggregateId: created.id,
      eventType: 'offer.created',
      payload: { productId: input.productId },
    });
    return created;
  });
}

export interface UpdateOfferInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly patch: OfferPatch;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly reason?: string | undefined;
  readonly traceId?: string | undefined;
}

/** Applies a tri-state patch onto the current offer, honoring the omitted=unchanged/null=clear/value=set idiom (same as every other patch type in this codebase). */
function mergePatch(current: Offer, patch: OfferPatch): Offer {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    next[key] = value === null ? undefined : value;
  }
  return next as unknown as Offer;
}

export async function updateOffer(deps: OfferDeps, input: UpdateOfferInput): Promise<Offer> {
  requirePermission(input.actorRole, 'settings.manage');
  return deps.uow.runInTransaction(async () => {
    const current = await deps.offerRepo.findById(input.id);
    if (!current) {
      throw new ResourceNotFoundError(`Offer ${input.id} not found.`, { id: input.id });
    }
    const product = await requireProduct(deps.productRepo, current.productId);
    const effective = mergePatch(current, input.patch);
    validateEffectiveOffer(
      effective,
      { productDirectSaleEnabled: product.directSaleEnabled },
      new Date(),
    );

    const updated = await deps.offerRepo.update(input.id, input.expectedVersion, input.patch);
    const changedFields = Object.keys(input.patch);
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'offer.updated',
      entityType: 'Offer',
      entityId: input.id,
      metadata: { changedFields, reason: input.reason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Offer',
      aggregateId: input.id,
      eventType: 'offer.updated',
      payload: { changedFields },
    });
    return updated;
  });
}

export async function listOffers(
  deps: Pick<OfferDeps, 'offerRepo'>,
  actorRole: PlatformRole,
  input?: CursorPaginationInput & OfferListFilter,
): Promise<CursorPage<Offer>> {
  requirePermission(actorRole, 'settings.manage');
  return deps.offerRepo.listAll(input);
}

export interface OfferEligibility {
  readonly offer: Offer;
  readonly ineligibilityReasons: readonly OfferIneligibilityReason[];
  readonly eligible: boolean;
}

/** CLAUDE.md: "per-offer eligibility reasons" for the admin operational view. */
export async function getOfferEligibility(
  deps: Pick<OfferDeps, 'offerRepo' | 'productRepo'> & {
    readonly settingsRepo: PlatformSettingsRepository;
  },
  offerId: string,
  actorRole: PlatformRole,
): Promise<OfferEligibility> {
  requirePermission(actorRole, 'settings.manage');
  const offer = await deps.offerRepo.findById(offerId);
  if (!offer) {
    throw new ResourceNotFoundError(`Offer ${offerId} not found.`, { id: offerId });
  }
  const product = await requireProduct(deps.productRepo, offer.productId);
  const settings = await deps.settingsRepo.get();
  const reasons = offerIneligibilityReasons(
    offer,
    {
      status: product.status,
      directSaleEnabled: product.directSaleEnabled,
      retiredAt: product.retiredAt,
    },
    settings.merchantCenterEnabled,
    new Date(),
  );
  return { offer, ineligibilityReasons: reasons, eligible: reasons.length === 0 };
}

export interface SetProductDirectSaleEnabledInput {
  readonly productId: string;
  readonly expectedVersion: number;
  readonly directSaleEnabled: boolean;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly reason?: string | undefined;
  readonly traceId?: string | undefined;
}

/** The explicit per-product opt-in ADR-0019 requires before any of its offers can ever be published. */
export async function setProductDirectSaleEnabled(
  deps: Pick<OfferDeps, 'productRepo' | 'auditRepo' | 'outboxRepo' | 'uow'>,
  input: SetProductDirectSaleEnabledInput,
): Promise<ProductWithTranslations> {
  requirePermission(input.actorRole, 'settings.manage');
  return deps.uow.runInTransaction(async () => {
    const current = await requireProduct(deps.productRepo, input.productId);
    if (current.directSaleEnabled === input.directSaleEnabled) {
      return current;
    }
    const updated = await deps.productRepo.setDirectSaleEnabled(
      input.productId,
      input.expectedVersion,
      input.directSaleEnabled,
    );
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'product.direct_sale_enabled_changed',
      entityType: 'Product',
      entityId: input.productId,
      metadata: { directSaleEnabled: input.directSaleEnabled, reason: input.reason },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Product',
      aggregateId: input.productId,
      eventType: 'product.direct_sale_enabled_changed',
      payload: { directSaleEnabled: input.directSaleEnabled },
    });
    return updated;
  });
}
