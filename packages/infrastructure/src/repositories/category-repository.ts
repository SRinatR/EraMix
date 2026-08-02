import {
  clampPagination,
  type CategoryRepository,
  type CategoryTranslationEditPatch,
  type CategoryWithTranslations,
  type Page,
} from '@eramix/application';
import {
  ResourceNotFoundError,
  SlugConflictError,
  type Category,
  type CategoryRoute,
  type CategoryTranslation,
  type LocaleCode,
} from '@eramix/domain';
import type {
  Category as CategoryRow,
  CategoryRoute as CategoryRouteRow,
  CategoryTranslation as CategoryTranslationRow,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import {
  assertOptimisticLockAcquired,
  withUniqueConstraintMapping,
} from '../prisma-error-mapping.js';
import { nullToUndefined } from '../prisma-json.js';
import { resolveClient } from '../transaction-context.js';

const WITH_TRANSLATIONS_AND_ROUTES = { translations: { include: { routes: true } } } as const;
type CategoryRowWithTranslations = CategoryRow & {
  translations: (CategoryTranslationRow & { routes: CategoryRouteRow[] })[];
};

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<CategoryWithTranslations | undefined> {
    const row = await resolveClient(this.prisma).category.findUnique({
      where: { id },
      include: WITH_TRANSLATIONS_AND_ROUTES,
    });
    return row ? toDomain(row) : undefined;
  }

  async findByCanonicalSlug(
    locale: LocaleCode,
    slug: string,
  ): Promise<CategoryWithTranslations | undefined> {
    const route = await resolveClient(this.prisma).categoryRoute.findUnique({
      where: { locale_slug: { locale, slug } },
    });
    if (!route || !route.isCanonical) {
      return undefined;
    }
    const translation = await resolveClient(this.prisma).categoryTranslation.findUnique({
      where: { id: route.translationId },
    });
    return translation ? this.findById(translation.categoryId) : undefined;
  }

  async findRouteBySlug(locale: LocaleCode, slug: string): Promise<CategoryRoute | undefined> {
    const route = await resolveClient(this.prisma).categoryRoute.findUnique({
      where: { locale_slug: { locale, slug } },
    });
    return route ? routeToDomain(route) : undefined;
  }

  async findCanonicalRouteByTranslationId(
    translationId: string,
  ): Promise<CategoryRoute | undefined> {
    const route = await resolveClient(this.prisma).categoryRoute.findFirst({
      where: { translationId, isCanonical: true },
    });
    return route ? routeToDomain(route) : undefined;
  }

  async addTranslation(
    categoryId: string,
    translation: Omit<CategoryTranslation, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<CategoryWithTranslations> {
    await withUniqueConstraintMapping<CategoryTranslationRow>(
      () =>
        resolveClient(this.prisma).categoryTranslation.create({
          data: {
            id: translation.id,
            categoryId,
            locale: translation.locale,
            name: translation.name,
            seoTitle: translation.seoTitle ?? null,
            seoDescription: translation.seoDescription ?? null,
          },
        }),
      (meta) => {
        throw new SlugConflictError(
          `A translation for locale "${translation.locale}" already exists on this category.`,
          { categoryId, locale: translation.locale, prismaMeta: meta },
        );
      },
    );
    const updated = await this.findById(categoryId);
    if (!updated) {
      throw new ResourceNotFoundError(`Category ${categoryId} not found after update.`, {
        id: categoryId,
      });
    }
    return updated;
  }

  async updateTranslation(
    categoryId: string,
    translationId: string,
    expectedVersion: number,
    patch: CategoryTranslationEditPatch,
  ): Promise<CategoryWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.categoryTranslation.updateMany({
      where: { id: translationId, categoryId, version: expectedVersion },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
        ...(patch.seoDescription !== undefined ? { seoDescription: patch.seoDescription } : {}),
        version: { increment: 1 },
      },
    });
    await assertOptimisticLockAcquired(
      count,
      `Category translation ${translationId} was modified by another operation (expected version ${expectedVersion}).`,
      { categoryId, translationId, expectedVersion },
    );
    const updated = await this.findById(categoryId);
    if (!updated) {
      throw new ResourceNotFoundError(`Category ${categoryId} not found after update.`, {
        id: categoryId,
      });
    }
    return updated;
  }

  /**
   * Creates a canonical route for a translation, demoting any previously
   * canonical route for the same translation first so the partial unique
   * index (`category_route_one_canonical`, migration.sql) is never violated
   * mid-transaction. Mirrors PrismaContentRepository.setCanonicalRoute.
   */
  async setCanonicalRoute(
    route: Omit<CategoryRoute, 'id' | 'createdAt' | 'isCanonical'>,
  ): Promise<CategoryRoute> {
    const client = resolveClient(this.prisma);
    await client.categoryRoute.updateMany({
      where: { translationId: route.translationId, isCanonical: true },
      data: { isCanonical: false },
    });
    const created = await withUniqueConstraintMapping<CategoryRouteRow>(
      () =>
        client.categoryRoute.create({
          data: {
            translationId: route.translationId,
            locale: route.locale,
            slug: route.slug,
            isCanonical: true,
          },
        }),
      (meta) => {
        throw new SlugConflictError(
          `Slug "${route.slug}" is already used by another route in this locale.`,
          { route, prismaMeta: meta },
        );
      },
    );
    return routeToDomain(created);
  }

  async create(
    category: Omit<Category, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<CategoryTranslation, 'version' | 'createdAt' | 'updatedAt'>[],
  ): Promise<CategoryWithTranslations> {
    const row = await withUniqueConstraintMapping<CategoryRowWithTranslations>(
      () =>
        resolveClient(this.prisma).category.create({
          data: {
            id: category.id,
            parentId: category.parentId ?? null,
            status: category.status,
            sortOrder: category.sortOrder,
            translations: {
              create: translations.map((translation) => ({
                id: translation.id,
                locale: translation.locale,
                name: translation.name,
                seoTitle: translation.seoTitle ?? null,
                seoDescription: translation.seoDescription ?? null,
              })),
            },
          },
          include: WITH_TRANSLATIONS_AND_ROUTES,
        }),
      (meta) => {
        throw new SlugConflictError('A translation for this category/locale already exists.', {
          categoryId: category.id,
          prismaMeta: meta,
        });
      },
    );
    return toDomain(row);
  }

  async updateStatus(
    id: string,
    expectedVersion: number,
    status: Category['status'],
  ): Promise<CategoryWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.category.updateMany({
      where: { id, version: expectedVersion },
      data: { status, version: { increment: 1 } },
    });
    await assertOptimisticLockAcquired(
      count,
      `Category ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await this.findById(id);
    if (!updated) {
      throw new ResourceNotFoundError(`Category ${id} not found after update.`, { id });
    }
    return updated;
  }

  async listPublished(): Promise<readonly CategoryWithTranslations[]> {
    const rows = await resolveClient(this.prisma).category.findMany({
      where: { status: 'PUBLISHED' },
      include: WITH_TRANSLATIONS_AND_ROUTES,
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listByParent(parentId: string | undefined): Promise<readonly CategoryWithTranslations[]> {
    const rows = await resolveClient(this.prisma).category.findMany({
      where: { status: 'PUBLISHED', parentId: parentId ?? null },
      include: WITH_TRANSLATIONS_AND_ROUTES,
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listAll(
    input: { limit?: number; offset?: number } = {},
  ): Promise<Page<CategoryWithTranslations>> {
    const { limit, offset } = clampPagination(input);
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.category.findMany({
        include: WITH_TRANSLATIONS_AND_ROUTES,
        orderBy: { sortOrder: 'asc' },
        take: limit,
        skip: offset,
      }),
      client.category.count(),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
  }
}

function toDomain(row: CategoryRowWithTranslations): CategoryWithTranslations {
  return {
    id: row.id,
    parentId: nullToUndefined(row.parentId),
    status: row.status,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    translations: row.translations.map((translation) => ({
      ...translationToDomain(translation),
      routes: translation.routes.map(routeToDomain),
    })),
  };
}

function translationToDomain(row: CategoryTranslationRow): CategoryTranslation {
  return {
    id: row.id,
    categoryId: row.categoryId,
    locale: row.locale,
    name: row.name,
    seoTitle: nullToUndefined(row.seoTitle),
    seoDescription: nullToUndefined(row.seoDescription),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function routeToDomain(row: CategoryRouteRow): CategoryRoute {
  return {
    id: row.id,
    translationId: row.translationId,
    locale: row.locale,
    slug: row.slug,
    isCanonical: row.isCanonical,
    createdAt: row.createdAt,
  };
}
