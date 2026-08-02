import {
  clampPagination,
  type Page,
  type ProductRepository,
  type ProductTranslationEditPatch,
  type ProductWithTranslations,
} from '@eramix/application';
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

  async listPublished(input: {
    categoryId?: string;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<readonly ProductWithTranslations[]> {
    const rows = await resolveClient(this.prisma).product.findMany({
      where: buildPublishedWhere(input),
      include: WITH_TRANSLATIONS,
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      skip: input.offset,
    });
    return rows.map(toDomain);
  }

  async countPublished(input: { categoryId?: string; search?: string }): Promise<number> {
    return resolveClient(this.prisma).product.count({ where: buildPublishedWhere(input) });
  }

  async listAll(
    input: { limit?: number; offset?: number } = {},
  ): Promise<Page<ProductWithTranslations>> {
    const { limit, offset } = clampPagination(input);
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.product.findMany({
        include: WITH_TRANSLATIONS,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      client.product.count(),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
  }
}

function buildPublishedWhere(input: { categoryId?: string; search?: string }) {
  const search = input.search;
  return {
    status: 'PUBLISHED' as const,
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

function toDomain(row: ProductRowWithTranslations): ProductWithTranslations {
  return {
    id: row.id,
    publicId: row.publicId,
    sku: row.sku,
    categoryId: row.categoryId,
    status: row.status,
    publishedAt: nullToUndefined(row.publishedAt),
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
