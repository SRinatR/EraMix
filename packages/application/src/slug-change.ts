import {
  normalizeSlug,
  type CategoryRoute,
  type ContentRoute,
  type ContentRouteNamespace,
  type LocaleCode,
  type PlatformRole,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { Clock, UnitOfWork } from './ports.js';
import type {
  AuditEventRepository,
  CategoryRepository,
  ContentRepository,
  OutboxMessageRepository,
} from './repositories.js';

/**
 * Explicit "change slug" editorial command (CLAUDE.md: "Slug changes are
 * explicit commands, not side effects of title changes"; TZ paragraph 505/541:
 * normalizes, checks the reserved list and `content.slug.change` permission,
 * and records oldSlug/newSlug/actor/reason/version in the audit trail). The
 * previous canonical route is kept (demoted, never deleted) by
 * `ContentRepository.setCanonicalRoute` so the old URL still resolves as a
 * one-hop 308 redirect (route-resolution.ts) — this use case only decides
 * *that* the change is authorized and records it; the redirect mechanics
 * live in the resolver.
 */
export interface ChangeContentSlugInput {
  readonly contentId: string;
  readonly translationId: string;
  readonly locale: LocaleCode;
  readonly namespace: ContentRouteNamespace;
  readonly newSlug: string;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly reason?: string | undefined;
  readonly traceId?: string | undefined;
}

export interface SlugChangeDeps {
  readonly contentRepo: ContentRepository;
  readonly auditRepo: AuditEventRepository;
  readonly outboxRepo: OutboxMessageRepository;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export async function changeContentSlug(
  deps: Pick<SlugChangeDeps, 'contentRepo' | 'auditRepo' | 'outboxRepo' | 'uow'>,
  input: ChangeContentSlugInput,
): Promise<ContentRoute> {
  requirePermission(input.actorRole, 'content.slug.change');
  const normalizedSlug = normalizeSlug(input.newSlug);

  return deps.uow.runInTransaction(async () => {
    const previousCanonical = await deps.contentRepo.findCanonicalRouteByTranslationId(
      input.translationId,
    );
    const route = await deps.contentRepo.setCanonicalRoute({
      translationId: input.translationId,
      locale: input.locale,
      namespace: input.namespace,
      slug: normalizedSlug,
    });
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'content.slug_changed',
      entityType: 'Content',
      entityId: input.contentId,
      metadata: {
        previousSlug: previousCanonical?.slug,
        newSlug: normalizedSlug,
        reason: input.reason,
      },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Content',
      aggregateId: input.contentId,
      eventType: 'content.slug_changed',
      payload: {
        translationId: input.translationId,
        locale: input.locale,
        previousSlug: previousCanonical?.slug ?? null,
        newSlug: normalizedSlug,
      },
    });
    return route;
  });
}

export interface ChangeCategorySlugInput {
  readonly categoryId: string;
  readonly translationId: string;
  readonly locale: LocaleCode;
  readonly newSlug: string;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly reason?: string | undefined;
  readonly traceId?: string | undefined;
}

/** Category is part of the "Публичный каталог" resource — CRUD is Admin-only (TZ §3.1 table 8). */
export async function changeCategorySlug(
  deps: {
    categoryRepo: CategoryRepository;
    auditRepo: AuditEventRepository;
    outboxRepo: OutboxMessageRepository;
    uow: UnitOfWork;
  },
  input: ChangeCategorySlugInput,
): Promise<CategoryRoute> {
  requirePermission(input.actorRole, 'catalog.write');
  const normalizedSlug = normalizeSlug(input.newSlug);

  return deps.uow.runInTransaction(async () => {
    const previousCanonical = await deps.categoryRepo.findCanonicalRouteByTranslationId(
      input.translationId,
    );
    const route = await deps.categoryRepo.setCanonicalRoute({
      translationId: input.translationId,
      locale: input.locale,
      slug: normalizedSlug,
    });
    await deps.auditRepo.record({
      actorUserId: input.actorUserId,
      action: 'category.slug_changed',
      entityType: 'Category',
      entityId: input.categoryId,
      metadata: {
        previousSlug: previousCanonical?.slug,
        newSlug: normalizedSlug,
        reason: input.reason,
      },
      traceId: input.traceId,
    });
    await deps.outboxRepo.enqueue({
      aggregateType: 'Category',
      aggregateId: input.categoryId,
      eventType: 'category.slug_changed',
      payload: {
        translationId: input.translationId,
        locale: input.locale,
        previousSlug: previousCanonical?.slug ?? null,
        newSlug: normalizedSlug,
      },
    });
    return route;
  });
}
