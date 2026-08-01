import { AccessDeniedError } from '@eramix/domain';
import type { CategoryRoute, ContentRoute } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import type { AuditEventRepository, OutboxMessageRepository } from './repositories.js';
import { changeCategorySlug, changeContentSlug } from './slug-change.js';

class InMemoryUnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

function fakeAuditRepo(): AuditEventRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    record: (event) => {
      calls.push(event);
      return Promise.resolve({ id: 'audit-1', createdAt: new Date(), ...event });
    },
    listByEntity: () => Promise.resolve([]),
  };
}

function fakeOutboxRepo(): OutboxMessageRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    enqueue: (message) => {
      calls.push(message);
      return Promise.resolve({
        id: 'outbox-1',
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        ...message,
      });
    },
    claimPending: () => Promise.resolve([]),
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  };
}

describe('changeContentSlug', () => {
  it('denies a CUSTOMER (no content.slug.change permission)', async () => {
    const contentRepo = {
      findCanonicalRouteByTranslationId: () => Promise.resolve(undefined),
      setCanonicalRoute: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      changeContentSlug(
        {
          contentRepo: contentRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          contentId: 'content-1',
          translationId: 'translation-1',
          locale: 'en',
          namespace: 'ARTICLES',
          newSlug: 'new-slug',
          actorUserId: 'user-1',
          actorRole: 'CUSTOMER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('allows CONTENT_EDITOR, demotes the previous canonical route, and records audit + outbox', async () => {
    const previousRoute: ContentRoute = {
      id: 'route-old',
      translationId: 'translation-1',
      locale: 'en',
      namespace: 'ARTICLES',
      slug: 'old-slug',
      isCanonical: true,
      createdAt: new Date(),
    };
    const newRoute: ContentRoute = { ...previousRoute, id: 'route-new', slug: 'new-slug' };
    const contentRepo = {
      findCanonicalRouteByTranslationId: () => Promise.resolve(previousRoute),
      setCanonicalRoute: () => Promise.resolve(newRoute),
    };
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await changeContentSlug(
      { contentRepo: contentRepo as never, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        contentId: 'content-1',
        translationId: 'translation-1',
        locale: 'en',
        namespace: 'ARTICLES',
        newSlug: 'New-Slug', // exercises case normalization (normalizeSlug lowercases; it does not transliterate)
        actorUserId: 'user-1',
        actorRole: 'CONTENT_EDITOR',
        reason: 'SEO refresh',
      },
    );

    expect(result.slug).toBe('new-slug');
    expect(auditRepo.calls).toHaveLength(1);
    expect(auditRepo.calls[0]).toMatchObject({
      action: 'content.slug_changed',
      metadata: { previousSlug: 'old-slug', newSlug: 'new-slug', reason: 'SEO refresh' },
    });
    expect(outboxRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'content.slug_changed' });
  });
});

describe('changeCategorySlug', () => {
  it('requires catalog.write — denies CONTENT_EDITOR (read-only on catalog per TZ table 8)', async () => {
    const categoryRepo = {
      findCanonicalRouteByTranslationId: () => Promise.resolve(undefined),
      setCanonicalRoute: () => {
        throw new Error('should not be called');
      },
    };
    await expect(
      changeCategorySlug(
        {
          categoryRepo: categoryRepo as never,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          categoryId: 'category-1',
          translationId: 'translation-1',
          locale: 'en',
          newSlug: 'new-slug',
          actorUserId: 'user-1',
          actorRole: 'CONTENT_EDITOR',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('allows ADMIN (catalog.write)', async () => {
    const newRoute: CategoryRoute = {
      id: 'route-new',
      translationId: 'translation-1',
      locale: 'en',
      slug: 'new-slug',
      isCanonical: true,
      createdAt: new Date(),
    };
    const categoryRepo = {
      findCanonicalRouteByTranslationId: () => Promise.resolve(undefined),
      setCanonicalRoute: () => Promise.resolve(newRoute),
    };
    const result = await changeCategorySlug(
      {
        categoryRepo: categoryRepo as never,
        auditRepo: fakeAuditRepo(),
        outboxRepo: fakeOutboxRepo(),
        uow: new InMemoryUnitOfWork(),
      },
      {
        categoryId: 'category-1',
        translationId: 'translation-1',
        locale: 'en',
        newSlug: 'new-slug',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );
    expect(result.slug).toBe('new-slug');
  });
});
