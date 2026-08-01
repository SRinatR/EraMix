import type { ContentRepository, ContentWithTranslations } from '@eramix/application';
import {
  SlugConflictError,
  type Content,
  type ContentRoute,
  type ContentRouteNamespace,
  type ContentTranslation,
  type LocaleCode,
} from '@eramix/domain';
import type {
  Content as ContentRow,
  ContentRoute as ContentRouteRow,
  ContentTranslation as ContentTranslationRow,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma-client.js';
import { withUniqueConstraintMapping } from '../prisma-error-mapping.js';
import { nullToUndefined } from '../prisma-json.js';
import { resolveClient } from '../transaction-context.js';

const WITH_TRANSLATIONS_AND_ROUTES = { translations: { include: { routes: true } } } as const;
type ContentRowWithTranslations = ContentRow & {
  translations: (ContentTranslationRow & { routes: ContentRouteRow[] })[];
};

export class PrismaContentRepository implements ContentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<ContentWithTranslations | undefined> {
    const row = await resolveClient(this.prisma).content.findUnique({
      where: { id },
      include: WITH_TRANSLATIONS_AND_ROUTES,
    });
    return row ? toDomain(row) : undefined;
  }

  async findByCanonicalSlug(
    namespace: ContentRouteNamespace,
    locale: LocaleCode,
    slug: string,
  ): Promise<ContentWithTranslations | undefined> {
    const route = await resolveClient(this.prisma).contentRoute.findUnique({
      where: { namespace_locale_slug: { namespace, locale, slug } },
    });
    if (!route || !route.isCanonical) {
      return undefined;
    }
    return this.findByTranslationId(route.translationId);
  }

  private async findByTranslationId(
    translationId: string,
  ): Promise<ContentWithTranslations | undefined> {
    const translation = await resolveClient(this.prisma).contentTranslation.findUnique({
      where: { id: translationId },
    });
    return translation ? this.findById(translation.contentId) : undefined;
  }

  async findRouteBySlug(
    namespace: ContentRouteNamespace,
    locale: LocaleCode,
    slug: string,
  ): Promise<ContentRoute | undefined> {
    const route = await resolveClient(this.prisma).contentRoute.findUnique({
      where: { namespace_locale_slug: { namespace, locale, slug } },
    });
    return route ? routeToDomain(route) : undefined;
  }

  async findCanonicalRouteByTranslationId(
    translationId: string,
  ): Promise<ContentRoute | undefined> {
    const route = await resolveClient(this.prisma).contentRoute.findFirst({
      where: { translationId, isCanonical: true },
    });
    return route ? routeToDomain(route) : undefined;
  }

  async create(
    content: Omit<Content, 'version' | 'createdAt' | 'updatedAt'>,
    translations: readonly Omit<ContentTranslation, 'createdAt' | 'updatedAt'>[],
  ): Promise<ContentWithTranslations> {
    const row = await withUniqueConstraintMapping<ContentRowWithTranslations>(
      () =>
        resolveClient(this.prisma).content.create({
          data: {
            id: content.id,
            type: content.type,
            status: content.status,
            publishedAt: content.publishedAt ?? null,
            translations: {
              create: translations.map((translation) => ({
                id: translation.id,
                locale: translation.locale,
                title: translation.title,
                summary: translation.summary ?? null,
                content: translation.content as object,
                seoTitle: translation.seoTitle ?? null,
                seoDescription: translation.seoDescription ?? null,
              })),
            },
          },
          include: WITH_TRANSLATIONS_AND_ROUTES,
        }),
      (meta) => {
        throw new SlugConflictError('A translation for this content/locale already exists.', {
          contentId: content.id,
          prismaMeta: meta,
        });
      },
    );
    return toDomain(row);
  }

  /**
   * Creates a canonical route for a translation, demoting any previously
   * canonical route for the same translation first so the partial unique
   * index (`content_route_one_canonical`, migration.sql) is never violated
   * mid-transaction. Callers that need this atomically with other writes
   * should run it inside UnitOfWork.runInTransaction.
   */
  async setCanonicalRoute(
    route: Omit<ContentRoute, 'id' | 'createdAt' | 'isCanonical'>,
  ): Promise<ContentRoute> {
    const client = resolveClient(this.prisma);
    await client.contentRoute.updateMany({
      where: { translationId: route.translationId, isCanonical: true },
      data: { isCanonical: false },
    });
    const created = await withUniqueConstraintMapping<ContentRouteRow>(
      () =>
        client.contentRoute.create({
          data: {
            translationId: route.translationId,
            locale: route.locale,
            namespace: route.namespace,
            slug: route.slug,
            isCanonical: true,
          },
        }),
      (meta) => {
        throw new SlugConflictError(
          `Slug "${route.slug}" is already used by another route in this locale/namespace.`,
          { route, prismaMeta: meta },
        );
      },
    );
    return routeToDomain(created);
  }

  async listPublished(type: Content['type']): Promise<readonly ContentWithTranslations[]> {
    const rows = await resolveClient(this.prisma).content.findMany({
      where: { type, status: 'PUBLISHED' },
      include: WITH_TRANSLATIONS_AND_ROUTES,
      orderBy: { publishedAt: 'desc' },
    });
    return rows.map(toDomain);
  }
}

function toDomain(row: ContentRowWithTranslations): ContentWithTranslations {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    publishedAt: nullToUndefined(row.publishedAt),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    translations: row.translations.map((translation) => ({
      ...translationToDomain(translation),
      routes: translation.routes.map(routeToDomain),
    })),
  };
}

function translationToDomain(row: ContentTranslationRow): ContentTranslation {
  return {
    id: row.id,
    contentId: row.contentId,
    locale: row.locale,
    title: row.title,
    summary: nullToUndefined(row.summary),
    content: row.content,
    seoTitle: nullToUndefined(row.seoTitle),
    seoDescription: nullToUndefined(row.seoDescription),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function routeToDomain(row: ContentRouteRow): ContentRoute {
  return {
    id: row.id,
    translationId: row.translationId,
    locale: row.locale,
    namespace: row.namespace,
    slug: row.slug,
    isCanonical: row.isCanonical,
    createdAt: row.createdAt,
  };
}
