import { randomUUID } from 'node:crypto';
import { ConcurrencyConflictError, SlugConflictError } from '@eramix/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../env.js';
import { createPrismaClient, type PrismaClient } from '../prisma-client.js';
import { PrismaUnitOfWork } from '../unit-of-work.js';
import { PrismaAdvertisingProviderConfigRepository } from './advertising-provider-config-repository.js';
import { PrismaAuditEventRepository } from './audit-event-repository.js';
import { PrismaCategoryRepository } from './category-repository.js';
import { PrismaProductRepository } from './product-repository.js';

/**
 * Exercises the Prisma repository adapters against a real, migrated
 * PostgreSQL 19 Beta 2 instance (ADR-0013) — the Phase 1 exit criteria that
 * unit tests against in-memory fakes (packages/application/src/*.test.ts)
 * cannot verify: the actual partial unique index enforcing one canonical
 * route per translation, the real unique-constraint error code mapping,
 * real optimistic-concurrency row-matching, and real transaction
 * commit/rollback. Requires DATABASE_URL to point at an already-migrated
 * database (CI's db-integration job runs `prisma migrate deploy` first).
 */
describe('PostgreSQL integration', () => {
  let prisma: PrismaClient;
  const categoryRepo = () => new PrismaCategoryRepository(prisma);
  const productRepo = () => new PrismaProductRepository(prisma);
  const auditRepo = () => new PrismaAuditEventRepository(prisma);
  const advertisingRepo = () => new PrismaAdvertisingProviderConfigRepository(prisma);

  beforeAll(() => {
    const env = loadEnv();
    prisma = createPrismaClient(env.DATABASE_URL);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces the partial unique index: a second canonical route for the same slug/locale is rejected', async () => {
    const category = await categoryRepo().create(
      {
        id: randomUUID(),
        status: 'PUBLISHED',
        sortOrder: 0,
      },
      [
        {
          id: randomUUID(),
          categoryId: '',
          locale: 'en',
          name: `Integration test ${randomUUID()}`,
        },
      ],
    );
    const translationId = category.translations[0]!.id;
    const slug = `integration-test-${randomUUID().slice(0, 8)}`;

    await categoryRepo().setCanonicalRoute({ translationId, locale: 'en', slug });

    // A different translation claiming the exact same (locale, slug) must fail.
    const otherCategory = await categoryRepo().create(
      { id: randomUUID(), status: 'PUBLISHED', sortOrder: 0 },
      [
        {
          id: randomUUID(),
          categoryId: '',
          locale: 'en',
          name: `Integration test other ${randomUUID()}`,
        },
      ],
    );
    await expect(
      categoryRepo().setCanonicalRoute({
        translationId: otherCategory.translations[0]!.id,
        locale: 'en',
        slug,
      }),
    ).rejects.toThrow(SlugConflictError);
  });

  it('optimistic concurrency: updateStatus with a stale version throws ConcurrencyConflictError', async () => {
    const product = await productRepo().create(
      {
        id: randomUUID(),
        publicId: randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase(),
        sku: `SKU-${randomUUID()}`,
        categoryId: (
          await categoryRepo().create({ id: randomUUID(), status: 'DRAFT', sortOrder: 0 }, [
            { id: randomUUID(), categoryId: '', locale: 'en', name: `Category ${randomUUID()}` },
          ])
        ).id,
        status: 'DRAFT',
      },
      [
        {
          id: randomUUID(),
          productId: '',
          locale: 'en',
          name: 'Integration test product',
          slug: `integration-product-${randomUUID().slice(0, 8)}`,
        },
      ],
    );

    // First update with the correct version succeeds.
    const updated = await productRepo().updateStatus(product.id, 0, 'PUBLISHED');
    expect(updated.version).toBe(1);

    // Retrying with the now-stale version 0 must fail.
    await expect(productRepo().updateStatus(product.id, 0, 'ARCHIVED')).rejects.toThrow(
      ConcurrencyConflictError,
    );
  });

  it('PrismaUnitOfWork rolls back all writes when the transaction body throws', async () => {
    const uow = new PrismaUnitOfWork(prisma);
    const entityId = randomUUID();

    await expect(
      uow.runInTransaction(async () => {
        await auditRepo().record({
          action: 'integration.rollback_test',
          entityType: 'IntegrationTest',
          entityId,
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    const events = await auditRepo().listByEntity('IntegrationTest', entityId);
    expect(events.data).toHaveLength(0);
  });

  it('PrismaUnitOfWork commits all writes when the transaction body succeeds', async () => {
    const uow = new PrismaUnitOfWork(prisma);
    const entityId = randomUUID();

    await uow.runInTransaction(async () => {
      await auditRepo().record({
        action: 'integration.commit_test',
        entityType: 'IntegrationTest',
        entityId,
      });
    });

    const events = await auditRepo().listByEntity('IntegrationTest', entityId);
    expect(events.data).toHaveLength(1);
  });

  it('retire() sets retiredAt/retirementReason and the CHECK constraint rejects retiring a non-ARCHIVED row', async () => {
    const category = await categoryRepo().create(
      { id: randomUUID(), status: 'ARCHIVED', sortOrder: 0 },
      [
        {
          id: randomUUID(),
          categoryId: '',
          locale: 'en',
          name: `Integration test retire ${randomUUID()}`,
        },
      ],
    );

    const retired = await categoryRepo().retire(category.id, 0, 'Discontinued (integration test).');
    expect(retired.retiredAt).toBeDefined();
    expect(retired.retirementReason).toBe('Discontinued (integration test).');
    expect(retired.version).toBe(1);

    // migration 20260803120000_add_retirement_state's category_retired_requires_archived
    // CHECK constraint is the data-layer half of ADR-0018/CLAUDE.md's "durable
    // retirement" guarantee — a direct raw write bypassing the application
    // layer's ARCHIVED-first precondition must still fail.
    const notArchived = await categoryRepo().create(
      { id: randomUUID(), status: 'PUBLISHED', sortOrder: 0 },
      [
        {
          id: randomUUID(),
          categoryId: '',
          locale: 'en',
          name: `Integration test not-archived ${randomUUID()}`,
        },
      ],
    );
    await expect(
      prisma.category.update({
        where: { id: notArchived.id },
        data: { retiredAt: new Date(), retirementReason: 'Should be rejected.' },
      }),
    ).rejects.toThrow();
  });

  it('advertising_provider_requires_identifier_when_enabled CHECK rejects an enabled provider with no identifier', async () => {
    const config = await prisma.advertisingProviderConfig.create({
      data: { provider: 'TIKTOK' },
    });
    expect(config.enabled).toBe(false);

    // A raw write bypassing the application-layer validator must still fail
    // — the data-layer half of CLAUDE.md's "never activate a provider with
    // nothing to integrate" guarantee.
    await expect(
      prisma.advertisingProviderConfig.update({
        where: { id: config.id },
        data: { enabled: true },
      }),
    ).rejects.toThrow();

    // The same write succeeds once a real identifier is present.
    const updated = await advertisingRepo().update('TIKTOK', config.version, {
      enabled: true,
      accountId: 'tiktok-account-123',
    });
    expect(updated.enabled).toBe(true);
    expect(updated.accountId).toBe('tiktok-account-123');
  });
});
