import {
  clampPagination,
  type ContentListFilter,
  type ContentRepository,
  type ContentTranslationEditPatch,
  type ContentWithTranslations,
  type Page,
} from '@eramix/application';
import {
  ResourceNotFoundError,
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
import {
  assertOptimisticLockAcquired,
  withUniqueConstraintMapping,
} from '../prisma-error-mapping.js';
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
    translations: readonly Omit<ContentTranslation, 'version' | 'createdAt' | 'updatedAt'>[],
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

  async addTranslation(
    contentId: string,
    translation: Omit<ContentTranslation, 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<ContentWithTranslations> {
    await withUniqueConstraintMapping<ContentTranslationRow>(
      () =>
        resolveClient(this.prisma).contentTranslation.create({
          data: {
            id: translation.id,
            contentId,
            locale: translation.locale,
            title: translation.title,
            summary: translation.summary ?? null,
            content: translation.content as object,
            seoTitle: translation.seoTitle ?? null,
            seoDescription: translation.seoDescription ?? null,
          },
        }),
      (meta) => {
        throw new SlugConflictError(
          `A translation for locale "${translation.locale}" already exists on this content item.`,
          { contentId, locale: translation.locale, prismaMeta: meta },
        );
      },
    );
    const updated = await this.findById(contentId);
    if (!updated) {
      throw new ResourceNotFoundError(`Content ${contentId} not found after update.`, {
        id: contentId,
      });
    }
    return updated;
  }

  async updateTranslation(
    contentId: string,
    translationId: string,
    expectedVersion: number,
    patch: ContentTranslationEditPatch,
  ): Promise<ContentWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.contentTranslation.updateMany({
      where: { id: translationId, contentId, version: expectedVersion },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.content !== undefined ? { content: patch.content as object } : {}),
        ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
        ...(patch.seoDescription !== undefined ? { seoDescription: patch.seoDescription } : {}),
        version: { increment: 1 },
      },
    });
    await assertOptimisticLockAcquired(
      count,
      `Content translation ${translationId} was modified by another operation (expected version ${expectedVersion}).`,
      { contentId, translationId, expectedVersion },
    );
    const updated = await this.findById(contentId);
    if (!updated) {
      throw new ResourceNotFoundError(`Content ${contentId} not found after update.`, {
        id: contentId,
      });
    }
    return updated;
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

  async updateStatus(
    id: string,
    expectedVersion: number,
    status: Content['status'],
  ): Promise<ContentWithTranslations> {
    const client = resolveClient(this.prisma);
    const { count } = await client.content.updateMany({
      where: { id, version: expectedVersion },
      data: {
        status,
        version: { increment: 1 },
        ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
      },
    });
    await assertOptimisticLockAcquired(
      count,
      `Content ${id} was modified by another operation (expected version ${expectedVersion}).`,
      { id, expectedVersion },
    );
    const updated = await this.findById(id);
    if (!updated) {
      throw new ResourceNotFoundError(`Content ${id} not found after update.`, { id });
    }
    return updated;
  }

  async listPublished(type: Content['type']): Promise<readonly ContentWithTranslations[]> {
    const rows = await resolveClient(this.prisma).content.findMany({
      where: { type, status: 'PUBLISHED' },
      include: WITH_TRANSLATIONS_AND_ROUTES,
      orderBy: { publishedAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async listAll(
    input: { limit?: number; offset?: number } & ContentListFilter = {},
  ): Promise<Page<ContentWithTranslations>> {
    const { limit, offset } = clampPagination(input);
    const where = buildContentWhere(input);
    const orderBy = {
      createdAt: input.sort === 'createdAt_asc' ? ('asc' as const) : ('desc' as const),
    };
    const client = resolveClient(this.prisma);
    const [rows, total] = await Promise.all([
      client.content.findMany({
        where,
        include: WITH_TRANSLATIONS_AND_ROUTES,
        orderBy,
        take: limit,
        skip: offset,
      }),
      client.content.count({ where }),
    ]);
    return { items: rows.map(toDomain), total, limit, offset };
  }
}

function buildContentWhere(input: ContentListFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (input.type !== undefined) {
    where['type'] = input.type;
  }
  if (input.status !== undefined) {
    where['status'] = input.status;
  }
  if (input.search !== undefined && input.search.trim().length > 0) {
    where['translations'] = {
      some: { title: { contains: input.search, mode: 'insensitive' } },
    };
  }
  return where;
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
    version: row.version,
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
