import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  type CursorPage,
  type CursorPaginationInput,
  type OfferListFilter,
  type OfferPatch,
  type OfferRepository,
} from '@eramix/application';
import { ResourceNotFoundError, type Offer } from '@eramix/domain';
import type { Offer as OfferRow } from '../generated/prisma/client.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import { buildCursorOrderBy, combineWithCursor, type SortSpec } from './cursor-query.js';
import { assertOptimisticLockAcquired } from '../prisma-error-mapping.js';
import { resolveClient } from '../transaction-context.js';

export class PrismaOfferRepository implements OfferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Offer | undefined> {
    const row = await resolveClient(this.prisma).offer.findUnique({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async listAll(input: CursorPaginationInput & OfferListFilter = {}): Promise<CursorPage<Offer>> {
    const limit = clampLimit(input.limit);
    const sortSpec = resolveOfferSort(input.sort);
    const decoded = decodeCursor(input.cursor);
    const where = combineWithCursor(buildOfferWhere(input), sortSpec, decoded);
    const orderBy = buildCursorOrderBy(sortSpec);
    const client = resolveClient(this.prisma);
    const rows = await client.offer.findMany({ where, orderBy, take: limit + 1 });
    const items = rows.map(toDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: cursorValueOf(sortSpec, item),
      id: item.id,
    }));
  }

  async create(offer: Omit<Offer, 'version' | 'createdAt' | 'updatedAt'>): Promise<Offer> {
    const row = await resolveClient(this.prisma).offer.create({
      data: {
        id: offer.id,
        productId: offer.productId,
        state: offer.state,
        sellerName: offer.sellerName,
        sellerUrl: offer.sellerUrl ?? null,
        priceAmountMinor: offer.priceAmountMinor,
        currency: offer.currency,
        taxDisplayPolicy: offer.taxDisplayPolicy,
        availability: offer.availability,
        availableFrom: offer.availableFrom ?? null,
        inventoryQuantity: offer.inventoryQuantity ?? null,
        sku: offer.sku,
        gtin: offer.gtin ?? null,
        mpn: offer.mpn ?? null,
        brand: offer.brand ?? null,
        eligibleCountries: [...offer.eligibleCountries],
        deliveryPolicyRef: offer.deliveryPolicyRef ?? null,
        returnPolicyRef: offer.returnPolicyRef ?? null,
        effectiveFrom: offer.effectiveFrom,
        effectiveTo: offer.effectiveTo ?? null,
        checkoutUrl: offer.checkoutUrl ?? null,
      },
    });
    return toDomain(row);
  }

  async update(id: string, expectedVersion: number, patch: OfferPatch): Promise<Offer> {
    const client = resolveClient(this.prisma);
    const data = toPrismaUpdateData(patch);
    const { count } = await client.offer.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Offer ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await this.findById(id);
    if (!updated) {
      throw new ResourceNotFoundError(`Offer ${id} not found after update.`, { id });
    }
    return updated;
  }
}

function toPrismaUpdateData(patch: OfferPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    data[key] = key === 'eligibleCountries' && Array.isArray(value) ? [...value] : value;
  }
  return data;
}

/** DB-005: an explicit allowlist, never a raw client-supplied sort field passed straight into Prisma's `orderBy`. */
function resolveOfferSort(sort: OfferListFilter['sort']): SortSpec {
  switch (sort) {
    case 'createdAt_asc':
      return { field: 'createdAt', direction: 'asc', kind: 'date' };
    case 'createdAt_desc':
    default:
      return { field: 'createdAt', direction: 'desc', kind: 'date' };
  }
}

function buildOfferWhere(input: OfferListFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (input.productId !== undefined) {
    where['productId'] = input.productId;
  }
  if (input.state !== undefined) {
    where['state'] = input.state;
  }
  return where;
}

function cursorValueOf(sortSpec: SortSpec, item: Offer): string | number {
  const value = (item as unknown as Record<string, unknown>)[sortSpec.field];
  return value instanceof Date ? value.toISOString() : (value as string | number);
}

function toDomain(row: OfferRow): Offer {
  return {
    id: row.id,
    productId: row.productId,
    state: row.state,
    sellerName: row.sellerName,
    sellerUrl: nullToUndefined(row.sellerUrl),
    priceAmountMinor: row.priceAmountMinor,
    currency: row.currency,
    taxDisplayPolicy: row.taxDisplayPolicy,
    availability: row.availability,
    availableFrom: nullToUndefined(row.availableFrom),
    inventoryQuantity: nullToUndefined(row.inventoryQuantity),
    sku: row.sku,
    gtin: nullToUndefined(row.gtin),
    mpn: nullToUndefined(row.mpn),
    brand: nullToUndefined(row.brand),
    eligibleCountries: row.eligibleCountries as string[],
    deliveryPolicyRef: nullToUndefined(row.deliveryPolicyRef),
    returnPolicyRef: nullToUndefined(row.returnPolicyRef),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: nullToUndefined(row.effectiveTo),
    checkoutUrl: nullToUndefined(row.checkoutUrl),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
