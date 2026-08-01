import type { CategoryRepository, CategoryWithTranslations } from '@eramix/application';
import {
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
import { withUniqueConstraintMapping } from '../prisma-error-mapping.js';
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

  async create(
    category: Omit<Category, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<CategoryTranslation, 'createdAt' | 'updatedAt'>[],
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
