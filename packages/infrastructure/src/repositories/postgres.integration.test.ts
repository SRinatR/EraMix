import { randomUUID } from 'node:crypto';
import {
  getPlatformSettings,
  listPlatformSettingsHistory,
  rollbackPlatformSettings,
  updatePlatformSettings,
} from '@eramix/application';
import { ConcurrencyConflictError, SlugConflictError, ValidationFailedError } from '@eramix/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../env.js';
import { createPrismaClient, type PrismaClient } from '../prisma-client.js';
import { PrismaUnitOfWork } from '../unit-of-work.js';
import { PrismaAdvertisingProviderConfigRepository } from './advertising-provider-config-repository.js';
import { PrismaAnalyticsSinkStatusRepository } from './analytics-sink-status-repository.js';
import { PrismaAuditEventRepository } from './audit-event-repository.js';
import { PrismaCategoryRepository } from './category-repository.js';
import { PrismaIndexNowEngineStatusRepository } from './indexnow-engine-status-repository.js';
import { PrismaOfferRepository } from './offer-repository.js';
import { PrismaOutboxMessageRepository } from './outbox-message-repository.js';
import {
  PrismaPlatformSettingsHistoryRepository,
  PrismaPlatformSettingsRepository,
} from './platform-settings-repository.js';
import { PrismaProductRepository } from './product-repository.js';
import { PrismaUserRepository } from './user-repository.js';

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
  const analyticsSinkStatusRepo = () => new PrismaAnalyticsSinkStatusRepository(prisma);
  const indexNowEngineStatusRepo = () => new PrismaIndexNowEngineStatusRepository(prisma);
  const offerRepo = () => new PrismaOfferRepository(prisma);
  const outboxRepo = () => new PrismaOutboxMessageRepository(prisma);
  const settingsRepo = () => new PrismaPlatformSettingsRepository(prisma);
  const settingsHistoryRepo = () => new PrismaPlatformSettingsHistoryRepository(prisma);
  const userRepo = () => new PrismaUserRepository(prisma);

  /** platform_settings is a true singleton (Phase B slice 1) — never created by a test, only ever read/updated; each test re-fetches the live version rather than assuming 0, since earlier tests in this file mutate it too. */
  async function createTestActor(): Promise<string> {
    const user = await userRepo().create({
      id: randomUUID(),
      issuer: 'https://integration-test.example',
      subject: `settings-actor-${randomUUID()}`,
      email: `settings-actor-${randomUUID()}@example.test`,
      displayName: 'Settings Integration Test Actor',
      status: 'ACTIVE',
      platformRole: 'ADMIN',
    });
    return user.id;
  }

  function settingsDeps() {
    return {
      settingsRepo: settingsRepo(),
      historyRepo: settingsHistoryRepo(),
      auditRepo: auditRepo(),
      outboxRepo: outboxRepo(),
      uow: new PrismaUnitOfWork(prisma),
    };
  }

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env.DATABASE_URL);
    // CI's migration-gate job applies migrations but does not run
    // prisma/seed.ts (that is a separate, Pi/local-only step) — the
    // PlatformSettings tests below need the singleton row to exist first.
    // Idempotent and side-effect-free if a real seed already ran (Pi/local).
    await prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', canonicalHost: 'eramix.example' },
      update: {},
    });
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
        directSaleEnabled: false,
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

  it('retire() persists a real successorId and the migration 20260803190000_add_retirement_successor CHECK constraints reject an invalid raw write', async () => {
    const successor = await categoryRepo().create(
      { id: randomUUID(), status: 'PUBLISHED', sortOrder: 0 },
      [
        {
          id: randomUUID(),
          categoryId: '',
          locale: 'en',
          name: `Integration test successor ${randomUUID()}`,
        },
      ],
    );
    const retiring = await categoryRepo().create(
      { id: randomUUID(), status: 'ARCHIVED', sortOrder: 0 },
      [
        {
          id: randomUUID(),
          categoryId: '',
          locale: 'en',
          name: `Integration test retiring ${randomUUID()}`,
        },
      ],
    );

    const retired = await categoryRepo().retire(
      retiring.id,
      0,
      'Merged (integration test).',
      successor.id,
    );
    expect(retired.successorId).toBe(successor.id);

    // category_successor_requires_retired: a raw write bypassing the
    // application layer must still fail when successorId is set on a
    // not-yet-retired row.
    const notYetRetired = await categoryRepo().create(
      { id: randomUUID(), status: 'ARCHIVED', sortOrder: 0 },
      [
        {
          id: randomUUID(),
          categoryId: '',
          locale: 'en',
          name: `Integration test not-yet-retired ${randomUUID()}`,
        },
      ],
    );
    await expect(
      prisma.category.update({
        where: { id: notYetRetired.id },
        data: { successorId: successor.id },
      }),
    ).rejects.toThrow();

    // category_successor_not_self: a row can never name itself as its own successor.
    await expect(
      prisma.category.update({
        where: { id: retired.id },
        data: { successorId: retired.id },
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

  it('offer_published_requires_checkout_url CHECK rejects a raw PUBLISHED write with no checkoutUrl', async () => {
    const category = await categoryRepo().create(
      { id: randomUUID(), status: 'PUBLISHED', sortOrder: 0 },
      [{ id: randomUUID(), categoryId: '', locale: 'en', name: `Category ${randomUUID()}` }],
    );
    const product = await productRepo().create(
      {
        id: randomUUID(),
        publicId: randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase(),
        sku: `SKU-${randomUUID()}`,
        categoryId: category.id,
        status: 'PUBLISHED',
        directSaleEnabled: true,
      },
      [],
    );
    const offer = await offerRepo().create({
      id: randomUUID(),
      productId: product.id,
      state: 'DRAFT',
      sellerName: 'EraMix LLC',
      priceAmountMinor: 15_000,
      currency: 'USD',
      taxDisplayPolicy: 'TAX_EXCLUDED',
      availability: 'IN_STOCK',
      inventoryQuantity: 10,
      sku: `SKU-${randomUUID()}`,
      eligibleCountries: ['US'],
      effectiveFrom: new Date(),
    });

    // A raw write bypassing the application-layer validator must still fail
    // — the data-layer half of CLAUDE.md's "no published/syndicatable offer
    // without... a real checkout URL" guarantee.
    await expect(
      prisma.offer.update({ where: { id: offer.id }, data: { state: 'PUBLISHED' } }),
    ).rejects.toThrow();

    // The same write succeeds once checkoutUrl/policy refs are present.
    const published = await offerRepo().update(offer.id, offer.version, {
      state: 'PUBLISHED',
      checkoutUrl: 'https://eramix.example/checkout',
      deliveryPolicyRef: 'https://eramix.example/delivery',
      returnPolicyRef: 'https://eramix.example/returns',
    });
    expect(published.state).toBe('PUBLISHED');
    expect(published.checkoutUrl).toBe('https://eramix.example/checkout');
  });

  it('offer_price_positive and offer_availability_stock_consistency CHECK constraints reject raw invalid writes', async () => {
    const category = await categoryRepo().create(
      { id: randomUUID(), status: 'PUBLISHED', sortOrder: 0 },
      [{ id: randomUUID(), categoryId: '', locale: 'en', name: `Category ${randomUUID()}` }],
    );
    const product = await productRepo().create(
      {
        id: randomUUID(),
        publicId: randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase(),
        sku: `SKU-${randomUUID()}`,
        categoryId: category.id,
        status: 'DRAFT',
        directSaleEnabled: false,
      },
      [],
    );

    await expect(
      prisma.offer.create({
        data: {
          productId: product.id,
          sellerName: 'EraMix LLC',
          priceAmountMinor: 0,
          currency: 'USD',
          taxDisplayPolicy: 'TAX_EXCLUDED',
          availability: 'IN_STOCK',
          sku: `SKU-${randomUUID()}`,
          eligibleCountries: [],
          effectiveFrom: new Date(),
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.offer.create({
        data: {
          productId: product.id,
          sellerName: 'EraMix LLC',
          priceAmountMinor: 1000,
          currency: 'USD',
          taxDisplayPolicy: 'TAX_EXCLUDED',
          availability: 'OUT_OF_STOCK',
          inventoryQuantity: 5,
          sku: `SKU-${randomUUID()}`,
          eligibleCountries: [],
          effectiveFrom: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('PlatformSettings is a real singleton: get() returns the seeded row, update() persists a patch and bumps version', async () => {
    const before = await settingsRepo().get();
    expect(before.id).toBe('singleton');
    const actorUserId = await createTestActor();
    const uniqueTitle = `Integration test title ${randomUUID()}`;

    const updated = await settingsRepo().update(
      before.version,
      { seoDefaultTitleTemplate: uniqueTitle },
      actorUserId,
    );

    expect(updated.id).toBe('singleton');
    expect(updated.seoDefaultTitleTemplate).toBe(uniqueTitle);
    expect(updated.version).toBe(before.version + 1);
    expect(updated.updatedByUserId).toBe(actorUserId);

    // get() always re-reads the same singleton row, never a second row.
    const again = await settingsRepo().get();
    expect(again.seoDefaultTitleTemplate).toBe(uniqueTitle);
    expect(again.version).toBe(updated.version);
  });

  it('PlatformSettings.update() with a stale expectedVersion throws ConcurrencyConflictError (real OCC row-matching)', async () => {
    const current = await settingsRepo().get();
    const actorUserId = await createTestActor();
    // current.version is valid *right now*, but the bump below immediately
    // makes it stale — proving the real row-matching check, not a hardcoded
    // "always try version 0" assumption.
    const staleVersion = current.version;

    await settingsRepo().update(
      current.version,
      { stripTrailingSlash: current.stripTrailingSlash },
      actorUserId,
    );

    await expect(
      settingsRepo().update(
        staleVersion,
        { stripTrailingSlash: current.stripTrailingSlash },
        actorUserId,
      ),
    ).rejects.toThrow(ConcurrencyConflictError);
  });

  it('updatePlatformSettings/history: the JSONB previousSnapshot round-trips Date fields as real Date instances, not strings', async () => {
    const actorUserId = await createTestActor();
    const current = await getPlatformSettings({ settingsRepo: settingsRepo() });
    const uniqueTitle = `Snapshot round-trip ${randomUUID()}`;

    await updatePlatformSettings(settingsDeps(), {
      expectedVersion: current.version,
      patch: { seoDefaultTitleTemplate: uniqueTitle },
      changeReason: 'Integration test: JSONB snapshot round-trip.',
      actorUserId,
      actorRole: 'ADMIN',
    });

    const page = await listPlatformSettingsHistory(
      { historyRepo: settingsHistoryRepo() },
      { limit: 1 },
    );
    const latest = page.data[0]!;
    expect(latest.previousVersion).toBe(current.version);
    // The snapshot captured is the state *before* this change — its own
    // title must not yet be the new one just written.
    expect(latest.previousSnapshot.seoDefaultTitleTemplate).not.toBe(uniqueTitle);
    expect(latest.previousSnapshot.createdAt).toBeInstanceOf(Date);
    expect(latest.previousSnapshot.updatedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(latest.previousSnapshot.createdAt.getTime())).toBe(false);
    expect(latest.changeReason).toBe('Integration test: JSONB snapshot round-trip.');
    expect(latest.changedByUserId).toBe(actorUserId);
  });

  it('updatePlatformSettings records one audit event and one outbox message atomically alongside the history row', async () => {
    const actorUserId = await createTestActor();
    const current = await getPlatformSettings({ settingsRepo: settingsRepo() });
    const beforeOutboxCount = await prisma.outboxMessage.count({
      where: { aggregateType: 'PlatformSettings', aggregateId: 'singleton' },
    });

    const updated = await updatePlatformSettings(settingsDeps(), {
      expectedVersion: current.version,
      patch: { seoDefaultDescriptionFallback: `Atomicity test ${randomUUID()}` },
      changeReason: 'Integration test: atomic history+audit+outbox.',
      actorUserId,
      actorRole: 'ADMIN',
    });

    const auditEvents = await auditRepo().listByEntity('PlatformSettings', 'singleton');
    const thisEvent = auditEvents.data.find(
      (event) => event.action === 'platform_settings.updated' && event.actorUserId === actorUserId,
    );
    expect(thisEvent).toBeDefined();

    const afterOutboxCount = await prisma.outboxMessage.count({
      where: { aggregateType: 'PlatformSettings', aggregateId: 'singleton' },
    });
    expect(afterOutboxCount).toBe(beforeOutboxCount + 1);

    const latestOutbox = await prisma.outboxMessage.findFirst({
      where: { aggregateType: 'PlatformSettings', aggregateId: 'singleton' },
      orderBy: { createdAt: 'desc' },
    });
    expect(latestOutbox?.eventType).toBe('platform_settings.updated');
    expect(updated.version).toBe(current.version + 1);
  });

  it('updatePlatformSettings rolls back history/audit/outbox together when validation fails mid-transaction (fail-closed atomicity)', async () => {
    const actorUserId = await createTestActor();
    const current = await getPlatformSettings({ settingsRepo: settingsRepo() });
    const beforeOutboxCount = await prisma.outboxMessage.count({
      where: { aggregateType: 'PlatformSettings', aggregateId: 'singleton' },
    });
    const beforeHistoryPage = await settingsHistoryRepo().list({ limit: 1 });

    // merchantCenterEnabled: true is unconditionally rejected by
    // validateEffectivePlatformSettings (CLAUDE.md: "do not enable Merchant
    // output for current quote-only products") — this must throw *before*
    // settingsRepo.update()/historyRepo.record()/outboxRepo.enqueue() ever
    // run, and the whole transaction must roll back if any of them did.
    await expect(
      updatePlatformSettings(settingsDeps(), {
        expectedVersion: current.version,
        patch: { merchantCenterEnabled: true },
        actorUserId,
        actorRole: 'ADMIN',
      }),
    ).rejects.toThrow(ValidationFailedError);

    const afterOutboxCount = await prisma.outboxMessage.count({
      where: { aggregateType: 'PlatformSettings', aggregateId: 'singleton' },
    });
    expect(afterOutboxCount).toBe(beforeOutboxCount);

    const afterHistoryPage = await settingsHistoryRepo().list({ limit: 1 });
    expect(afterHistoryPage.data[0]?.id).toBe(beforeHistoryPage.data[0]?.id);

    const unchanged = await settingsRepo().get();
    expect(unchanged.version).toBe(current.version);
    expect(unchanged.merchantCenterEnabled).toBe(false);
  });

  it('rollbackPlatformSettings applies a past snapshot as a new audited update, never a destructive rewrite of history', async () => {
    const actorUserId = await createTestActor();
    const original = await getPlatformSettings({ settingsRepo: settingsRepo() });
    const originalTitle = original.seoDefaultTitleTemplate;

    const changed = await updatePlatformSettings(settingsDeps(), {
      expectedVersion: original.version,
      patch: { seoDefaultTitleTemplate: `Pre-rollback value ${randomUUID()}` },
      changeReason: 'Integration test: value to be rolled back.',
      actorUserId,
      actorRole: 'ADMIN',
    });

    const page = await listPlatformSettingsHistory(
      { historyRepo: settingsHistoryRepo() },
      { limit: 1 },
    );
    const historyEntryToRollBack = page.data[0]!;
    expect(historyEntryToRollBack.previousVersion).toBe(original.version);

    const rolledBack = await rollbackPlatformSettings(settingsDeps(), {
      historyEntryId: historyEntryToRollBack.id,
      expectedVersion: changed.version,
      actorUserId,
      actorRole: 'ADMIN',
    });

    expect(rolledBack.seoDefaultTitleTemplate).toBe(originalTitle);
    // Rollback is itself a new, forward-only version bump, never a rewrite
    // of a past row — the settings row's version keeps advancing.
    expect(rolledBack.version).toBe(changed.version + 1);

    // The rollback is itself audited as a new history entry — the original
    // "pre-rollback" entry created above is never deleted or mutated.
    const pageAfterRollback = await listPlatformSettingsHistory(
      { historyRepo: settingsHistoryRepo() },
      { limit: 2 },
    );
    expect(pageAfterRollback.data[0]!.changeReason).toContain(
      'Rollback to the state before history entry',
    );
    expect(pageAfterRollback.data.some((entry) => entry.id === historyEntryToRollBack.id)).toBe(
      true,
    );
  });

  it('AnalyticsSinkStatus.recordResult upserts a real row and listAll reflects the latest snapshot per sink', async () => {
    const sinkName = `test-sink-${randomUUID()}`;
    const firstAttemptAt = new Date('2026-08-03T09:00:00.000Z');

    await analyticsSinkStatusRepo().recordResult({
      sink: sinkName,
      lastAttemptAt: firstAttemptAt,
      lastSucceeded: false,
      lastSkipped: false,
      lastError: 'HTTP 503',
    });

    const afterFirst = await analyticsSinkStatusRepo().listAll();
    const firstRow = afterFirst.find((row) => row.sink === sinkName);
    expect(firstRow).toMatchObject({
      lastSucceeded: false,
      lastSkipped: false,
      lastError: 'HTTP 503',
    });
    expect(firstRow?.lastAttemptAt.toISOString()).toBe(firstAttemptAt.toISOString());

    // A second recordResult() call for the same sink must upsert (overwrite),
    // never insert a second row — this is a diagnostic snapshot, not a log.
    const secondAttemptAt = new Date('2026-08-03T10:00:00.000Z');
    await analyticsSinkStatusRepo().recordResult({
      sink: sinkName,
      lastAttemptAt: secondAttemptAt,
      lastSucceeded: true,
      lastSkipped: false,
    });

    const afterSecond = await analyticsSinkStatusRepo().listAll();
    const matchingRows = afterSecond.filter((row) => row.sink === sinkName);
    expect(matchingRows).toHaveLength(1);
    expect(matchingRows[0]).toMatchObject({ lastSucceeded: true, lastError: undefined });
    expect(matchingRows[0]?.lastAttemptAt.toISOString()).toBe(secondAttemptAt.toISOString());
  });

  it('IndexNowEngineStatus.recordResult upserts a real row and listAll reflects the latest snapshot per engine', async () => {
    const engineName = `test-engine-${randomUUID()}`;
    const firstAttemptAt = new Date('2026-08-03T09:00:00.000Z');

    await indexNowEngineStatusRepo().recordResult({
      engine: engineName,
      lastAttemptAt: firstAttemptAt,
      lastSucceeded: false,
      lastStatusCode: 503,
      lastError: 'HTTP 503',
      lastUrlCount: 3,
    });

    const afterFirst = await indexNowEngineStatusRepo().listAll();
    const firstRow = afterFirst.find((row) => row.engine === engineName);
    expect(firstRow).toMatchObject({
      lastSucceeded: false,
      lastStatusCode: 503,
      lastError: 'HTTP 503',
      lastUrlCount: 3,
    });
    expect(firstRow?.lastAttemptAt.toISOString()).toBe(firstAttemptAt.toISOString());

    // A second recordResult() call for the same engine must upsert (overwrite),
    // never insert a second row — this is a diagnostic snapshot, not a log.
    const secondAttemptAt = new Date('2026-08-03T10:00:00.000Z');
    await indexNowEngineStatusRepo().recordResult({
      engine: engineName,
      lastAttemptAt: secondAttemptAt,
      lastSucceeded: true,
      lastStatusCode: 200,
      lastUrlCount: 1,
    });

    const afterSecond = await indexNowEngineStatusRepo().listAll();
    const matchingRows = afterSecond.filter((row) => row.engine === engineName);
    expect(matchingRows).toHaveLength(1);
    expect(matchingRows[0]).toMatchObject({
      lastSucceeded: true,
      lastStatusCode: 200,
      lastError: undefined,
      lastUrlCount: 1,
    });
    expect(matchingRows[0]?.lastAttemptAt.toISOString()).toBe(secondAttemptAt.toISOString());
  });
});
