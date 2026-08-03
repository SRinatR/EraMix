import {
  buildCursorPage,
  clampLimit,
  decodeCursor,
  type CursorPage,
  type CursorPaginationInput,
  type ProductListFilter,
  type ProductRepository,
  type ProductTranslationEditPatch,
  type ProductWithTranslations,
} from '@eramix/application';
import {
  buildCursorOrderBy,
  combineWithCursor,
  cursorValueOf,
  type SortSpec,
} from './cursor-query.js';
import {
  ResourceNotFoundError,
  SlugConflictError,
  type Product,
  type ProductTranslation,
} from '@eramix/domain';
import type {
  Product as ProductRow,
  ProductTranslation as ProductTranslationRow,
} from '../generated/prisma/client.js';
import { nullToUndefined } from '../prisma-json.js';
import type { PrismaClient } from '../prisma-client.js';
import {
  assertOptimisticLockAcquired,
  withUniqueConstraintMapping,
} from '../prisma-error-mapping.js';
import { resolveClient } from '../transaction-context.js';

const WITH_TRANSLATIONS = { translations: true } as const;
type ProductRowWithTranslations = ProductRow & { translations: ProductTranslationRow[] };

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ProductWithTranslations | undefined> {
    const row = await resolveClient(this.prisma).product.findUnique({
      where: { id },
      include: WITH_TRANSLATIONS,
    });
    return row ? toDomain(row) : undefined;
  }

  async findByPublicId(publicId: string): Promise<ProductWithTranslations | undefined> {
    const row = await resolveClient(this.prisma).product.findUnique({
      where: { publicId },
      include: WITH_TRANSLATIONS,
    });
    return row ? toDomain(row) : undefined;
  }

  async findBySku(sku: string): Promise<ProductWithTranslations | undefined> {
    const row = await resolveClient(this.prisma).product.findUnique({
      where: { sku },
      include: WITH_TRANSLATIONS,
    });
    return row ? toDomain(row) : undefined;
  }

  async create(
    product: Omit<Product, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<ProductTranslation, 'version' | 'createdAt' | 'updatedAt'>[],
  ): Promise<ProductWithTranslations> {
    const row = await resolveClient(this.prisma).product.create({
      data: {
        id: product.id,
        publicId: product.publicId,
        sku: product.sku,
        categoryId: product.categoryId,
        status: product.status,
        publishedAt: product.publishedAt ?? null,
        directSaleEnabled: product.directSaleEnabled,
        translations: {
          create: translations.map((translation) => ({
            id: translation.id,
            locale: translation.locale,
            name: translation.name,
            slug: translation.slug,
            description: translation.description ?? null,
            seoTitle: translation.seoTitle ?? null,
            seoDescription: translation.seoDescription ?? null,
            priceFromMinor: translation.indicativePrice?.priceFromMinor ?? null,
            currency: translation.indicativePrice?.currency ?? null,
            priceDisclaimer: translation.indicativePrice?.priceDisclaimer ?? null,
          })),
        },
      },
      include: WITH_TRANSLATIONS,
    });
    return toDomain(row);
  }

  async addTranslation(
    productId: string,
    translation: Omit<ProductTranslation, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProductWithTranslations> {
    await withUniqueConstraintMapping<ProductTranslationRow>(
      () =>
        resolveClient(this.prisma).productTranslation.create({
          data: {
            id: translation.id,
            productId,
            locale: translation.locale,
            name: translation.name,
            slug: translation.slug,
            description: translation.description ?? null,
            seoTitle: translation.seoTitle ?? null,
            seoDescription: translation.seoDescription ?? null,
            priceFromMinor: translation.indicativePrice?.priceFromMinor ?? null,
            currency: translation.indicativePrice?.currency ?? null,
            priceDisclaimer: translation.indicativePrice?.priceDisclaimer ?? null,
          },
        }),
      (meta) => {
        throw new SlugConflictError(
          `A translation for locale "${translation.locale}" already exists on this product.`,
          { productId, locale: translation.locale, prismaMeta: meta },
        );
      },
    );
    const updated = await this.findById(productId);
    if (!updated) {
      throw new ResourceNotFoundError(`Product ${productId} not found after update.`, {
        id: productId,
      });
    }
    return updated;
  }

  async updateTranslation(
    productId: string,
    translationId: string,
    expectedVersion: number,
    patch: ProductTranslationEditPatch,
  ): Promise<ProductWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.productTranslation.updateMany({
      where: { id: translationId, productId, version: expectedVersion },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
        ...(patch.seoDescription !== undefined ? { seoDescription: patch.seoDescription } : {}),
        ...(patch.indicativePrice !== undefined
          ? {
              priceFromMinor: patch.indicativePrice?.priceFromMinor ?? null,
              currency: patch.indicativePrice?.currency ?? null,
              priceDisclaimer: patch.indicativePrice?.priceDisclaimer ?? null,
            }
          : {}),
        version: { increment: 1 },
      },
    });
    await assertOptimisticLockAcquired(
      count,
      `Product translation ${translationId} was modified by another operation (expected version ${expectedVersion}).`,
      { productId, translationId, expectedVersion },
    );
    const updated = await this.findById(productId);
    if (!updated) {
      throw new ResourceNotFoundError(`Product ${productId} not found after update.`, {
        id: productId,
      });
    }
    return updated;
  }

  async updateStatus(
    id: string,
    expectedVersion: number,
    status: Product['status'],
  ): Promise<ProductWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.product.updateMany({
      where: { id, version: expectedVersion },
      data: {
        status,
        version: { increment: 1 },
        ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
      },
    });
    await assertOptimisticLockAcquired(
      count,
      `Product ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await this.findById(id);
    if (!updated) {
      throw new ResourceNotFoundError(`Product ${id} not found after update.`, { id });
    }
    return updated;
  }

  async retire(
    id: string,
    expectedVersion: number,
    reason: string,
    successorId?: string,
  ): Promise<ProductWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.product.updateMany({
      where: { id, version: expectedVersion },
      data: {
        retiredAt: new Date(),
        retirementReason: reason,
        successorId: successorId ?? null,
        version: { increment: 1 },
      },
    });
    await assertOptimisticLockAcquired(
      count,
      `Product ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await this.findById(id);
    if (!updated) {
      throw new ResourceNotFoundError(`Product ${id} not found after update.`, { id });
    }
    return updated;
  }

  async setDirectSaleEnabled(
    id: string,
    expectedVersion: number,
    directSaleEnabled: boolean,
  ): Promise<ProductWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.product.updateMany({
      where: { id, version: expectedVersion },
      data: { directSaleEnabled, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Product ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await this.findById(id);
    if (!updated) {
      throw new ResourceNotFoundError(`Product ${id} not found after update.`, { id });
    }
    return updated;
  }

  /** Public catalog search (ADR-0017/API-005) — cursor-paginated, PUBLISHED only. */
  async listPublished(
    input: { categoryId?: string; search?: string } & CursorPaginationInput,
  ): Promise<CursorPage<ProductWithTranslations>> {
    const limit = clampLimit(input.limit);
    const sortSpec = PUBLISHED_SORT;
    const decoded = decodeCursor(input.cursor);
    const where = combineWithCursor(buildPublishedWhere(input), sortSpec, decoded);
    const rows = await resolveClient(this.prisma).product.findMany({
      where,
      include: WITH_TRANSLATIONS,
      orderBy: buildCursorOrderBy(sortSpec),
      take: limit + 1,
    });
    const items = rows.map(toDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: cursorValueOf(sortSpec, item as unknown as Record<string, unknown>),
      id: item.id,
    }));
  }

  async listAll(
    input: CursorPaginationInput & ProductListFilter = {},
  ): Promise<CursorPage<ProductWithTranslations>> {
    const limit = clampLimit(input.limit);
    const sortSpec = resolveProductSort(input.sort);
    const decoded = decodeCursor(input.cursor);
    const filterWhere = {
      ...buildSearchWhere(input),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    const where = combineWithCursor(filterWhere, sortSpec, decoded);
    const orderBy = buildCursorOrderBy(sortSpec);
    const client = resolveClient(this.prisma);
    const rows = await client.product.findMany({
      where,
      include: WITH_TRANSLATIONS,
      orderBy,
      take: limit + 1,
    });
    const items = rows.map(toDomain);
    return buildCursorPage(items, limit, (item) => ({
      v: cursorValueOf(sortSpec, item as unknown as Record<string, unknown>),
      id: item.id,
    }));
  }
}

const PUBLISHED_SORT: SortSpec = { field: 'createdAt', direction: 'desc', kind: 'date' };

/** DB-005: an explicit allowlist, never a raw client-supplied sort field passed straight into Prisma's `orderBy`. */
function resolveProductSort(sort: ProductListFilter['sort']): SortSpec {
  switch (sort) {
    case 'sku_asc':
      return { field: 'sku', direction: 'asc', kind: 'string' };
    case 'sku_desc':
      return { field: 'sku', direction: 'desc', kind: 'string' };
    case 'createdAt_asc':
      return { field: 'createdAt', direction: 'asc', kind: 'date' };
    case 'createdAt_desc':
    default:
      return { field: 'createdAt', direction: 'desc', kind: 'date' };
  }
}

/** Shared by the public PUBLISHED-only search and the admin all-statuses listing — category/search matching is identical, only the status scope differs. */
function buildSearchWhere(input: { categoryId?: string; search?: string }) {
  const search = input.search;
  return {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(search !== undefined && search.length > 0
      ? {
          OR: [
            { sku: { contains: search, mode: 'insensitive' as const } },
            {
              translations: { some: { name: { contains: search, mode: 'insensitive' as const } } },
            },
          ],
        }
      : {}),
  };
}

function buildPublishedWhere(input: { categoryId?: string; search?: string }) {
  return { status: 'PUBLISHED' as const, ...buildSearchWhere(input) };
}

function toDomain(row: ProductRowWithTranslations): ProductWithTranslations {
  return {
    id: row.id,
    publicId: row.publicId,
    sku: row.sku,
    categoryId: row.categoryId,
    status: row.status,
    publishedAt: nullToUndefined(row.publishedAt),
    retiredAt: nullToUndefined(row.retiredAt),
    retirementReason: nullToUndefined(row.retirementReason),
    successorId: nullToUndefined(row.successorId),
    directSaleEnabled: row.directSaleEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    translations: row.translations.map(translationToDomain),
  };
}

function translationToDomain(row: ProductTranslationRow): ProductTranslation {
  const hasPrice = row.priceFromMinor !== null && row.currency !== null;
  return {
    id: row.id,
    productId: row.productId,
    locale: row.locale,
    name: row.name,
    slug: row.slug,
    description: nullToUndefined(row.description),
    seoTitle: nullToUndefined(row.seoTitle),
    seoDescription: nullToUndefined(row.seoDescription),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    ...(hasPrice
      ? {
          indicativePrice: {
            // Non-null asserted: `hasPrice` just proved both fields are set.
            priceFromMinor: row.priceFromMinor!,
            currency: row.currency!,
            priceMode: row.priceMode,
            ...(row.priceDisclaimer !== null ? { priceDisclaimer: row.priceDisclaimer } : {}),
          },
        }
      : {}),
  };
}
