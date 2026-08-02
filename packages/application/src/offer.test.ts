import { AccessDeniedError, ResourceNotFoundError, ValidationFailedError } from '@eramix/domain';
import type { Offer, PlatformSettings, Product, ProductTranslation } from '@eramix/domain';
import { describe, expect, it, vi } from 'vitest';
import type {
  AuditEventRepository,
  OfferRepository,
  OutboxMessageRepository,
  PlatformSettingsRepository,
  ProductRepository,
} from './repositories.js';
import {
  createOffer,
  getOfferEligibility,
  listOffers,
  setProductDirectSaleEnabled,
  updateOffer,
} from './offer.js';

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
    listByEntity: () => Promise.resolve({ data: [], page: { hasMore: false } }),
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
    markDeadLetter: () => Promise.resolve(),
  };
}

function makeProduct(
  overrides: Partial<Product> = {},
): Product & { translations: ProductTranslation[] } {
  return {
    id: 'product-1',
    publicId: 'P8K4F2M9',
    sku: 'SKU-1',
    categoryId: 'category-1',
    status: 'PUBLISHED',
    directSaleEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    translations: [],
    ...overrides,
  };
}

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'offer-1',
    productId: 'product-1',
    state: 'DRAFT',
    sellerName: 'EraMix LLC',
    priceAmountMinor: 15_000,
    currency: 'USD',
    taxDisplayPolicy: 'TAX_EXCLUDED',
    availability: 'IN_STOCK',
    inventoryQuantity: 10,
    sku: 'SKU-1',
    eligibleCountries: ['US'],
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

const CREATE_INPUT = {
  id: 'offer-1',
  productId: 'product-1',
  sellerName: 'EraMix LLC',
  priceAmountMinor: 15_000,
  currency: 'USD',
  taxDisplayPolicy: 'TAX_EXCLUDED' as const,
  availability: 'IN_STOCK' as const,
  inventoryQuantity: 10,
  sku: 'SKU-1',
  eligibleCountries: ['US'],
  effectiveFrom: new Date('2026-08-01T00:00:00Z'),
  actorUserId: 'admin-1',
  actorRole: 'ADMIN' as const,
};

describe('createOffer', () => {
  it('denies a MANAGER (no settings.manage permission)', async () => {
    const productRepo = {
      findById: () => {
        throw new Error('should not be called');
      },
    } as unknown as ProductRepository;
    const offerRepo = {
      create: () => {
        throw new Error('should not be called');
      },
    } as unknown as OfferRepository;
    await expect(
      createOffer(
        {
          offerRepo,
          productRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        { ...CREATE_INPUT, actorRole: 'MANAGER' },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('throws ResourceNotFoundError for an unknown product', async () => {
    const productRepo = {
      findById: () => Promise.resolve(undefined),
    } as unknown as ProductRepository;
    const offerRepo = {
      create: () => {
        throw new Error('should not be called');
      },
    } as unknown as OfferRepository;
    await expect(
      createOffer(
        {
          offerRepo,
          productRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        CREATE_INPUT,
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('creates a DRAFT offer, records audit + outbox, even for a quote-only (not direct-sale) product', async () => {
    const productRepo = {
      findById: () => Promise.resolve(makeProduct({ directSaleEnabled: false })),
    } as unknown as ProductRepository;
    const created = makeOffer();
    const offerRepo = { create: () => Promise.resolve(created) } as unknown as OfferRepository;
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await createOffer(
      { offerRepo, productRepo, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      CREATE_INPUT,
    );

    expect(result.state).toBe('DRAFT');
    expect(auditRepo.calls).toHaveLength(1);
    expect(auditRepo.calls[0]).toMatchObject({ action: 'offer.created' });
    expect(outboxRepo.calls).toHaveLength(1);
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'offer.created' });
  });

  it('rejects creating a structurally invalid offer (e.g. non-positive price) before ever calling the repository', async () => {
    const productRepo = {
      findById: () => Promise.resolve(makeProduct()),
    } as unknown as ProductRepository;
    const offerRepo = {
      create: () => {
        throw new Error('should not be called');
      },
    } as unknown as OfferRepository;
    await expect(
      createOffer(
        {
          offerRepo,
          productRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        { ...CREATE_INPUT, priceAmountMinor: 0 },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });
});

describe('updateOffer', () => {
  it('rejects publishing when the parent product is not direct-sale enabled', async () => {
    const current = makeOffer();
    const productRepo = {
      findById: () => Promise.resolve(makeProduct({ directSaleEnabled: false })),
    } as unknown as ProductRepository;
    const offerRepo = {
      findById: () => Promise.resolve(current),
      update: () => {
        throw new Error('should not be called');
      },
    } as unknown as OfferRepository;

    await expect(
      updateOffer(
        {
          offerRepo,
          productRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'offer-1',
          expectedVersion: 0,
          patch: {
            state: 'PUBLISHED',
            checkoutUrl: 'https://eramix.example/checkout',
            deliveryPolicyRef: 'https://eramix.example/delivery',
            returnPolicyRef: 'https://eramix.example/returns',
          },
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ValidationFailedError);
  });

  it('publishes an offer once the product is direct-sale enabled and every precondition is met', async () => {
    const current = makeOffer();
    const productRepo = {
      findById: () => Promise.resolve(makeProduct({ directSaleEnabled: true })),
    } as unknown as ProductRepository;
    const published = {
      ...current,
      state: 'PUBLISHED' as const,
      checkoutUrl: 'https://eramix.example/checkout',
      deliveryPolicyRef: 'https://eramix.example/delivery',
      returnPolicyRef: 'https://eramix.example/returns',
      version: 1,
    };
    const offerRepo = {
      findById: () => Promise.resolve(current),
      update: () => Promise.resolve(published),
    } as unknown as OfferRepository;
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await updateOffer(
      { offerRepo, productRepo, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        id: 'offer-1',
        expectedVersion: 0,
        patch: {
          state: 'PUBLISHED',
          checkoutUrl: 'https://eramix.example/checkout',
          deliveryPolicyRef: 'https://eramix.example/delivery',
          returnPolicyRef: 'https://eramix.example/returns',
        },
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        reason: 'Launching direct sale for this SKU.',
      },
    );

    expect(result.state).toBe('PUBLISHED');
    expect(auditRepo.calls[0]).toMatchObject({
      action: 'offer.updated',
      metadata: { reason: 'Launching direct sale for this SKU.' },
    });
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'offer.updated' });
  });

  it('throws ResourceNotFoundError for an unknown offer', async () => {
    const offerRepo = { findById: () => Promise.resolve(undefined) } as unknown as OfferRepository;
    const productRepo = {} as ProductRepository;
    await expect(
      updateOffer(
        {
          offerRepo,
          productRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          id: 'missing',
          expectedVersion: 0,
          patch: {},
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});

describe('listOffers', () => {
  it('denies a CUSTOMER (no settings.manage permission)', async () => {
    const offerRepo = {
      listAll: () => {
        throw new Error('should not be called');
      },
    } as unknown as OfferRepository;
    await expect(listOffers({ offerRepo }, 'CUSTOMER')).rejects.toThrow(AccessDeniedError);
  });

  it('returns the paginated offer list for an ADMIN', async () => {
    const page = { data: [makeOffer()], page: { hasMore: false } };
    const offerRepo = { listAll: () => Promise.resolve(page) } as unknown as OfferRepository;
    const result = await listOffers({ offerRepo }, 'ADMIN');
    expect(result.data).toHaveLength(1);
  });
});

function makeSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    id: 'singleton',
    canonicalHost: 'eramix.example',
    forceHttps: true,
    stripTrailingSlash: true,
    crawlerGlobalNoindex: false,
    googleExtendedAllowed: true,
    aiCompatibilityFilesEnabled: false,
    analyticsConsentRequired: true,
    ga4Enabled: false,
    yandexMetricaEnabled: false,
    rustAnalyticsEnabled: false,
    indexNowEnabled: false,
    merchantCenterEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 0,
    ...overrides,
  };
}

describe('getOfferEligibility', () => {
  it('always reports MERCHANT_CENTER_DISABLED while the kill switch is off (the default, dormant state)', async () => {
    const offer = makeOffer({
      state: 'PUBLISHED',
      checkoutUrl: 'https://eramix.example/checkout',
      deliveryPolicyRef: 'https://eramix.example/delivery',
      returnPolicyRef: 'https://eramix.example/returns',
    });
    const offerRepo = { findById: () => Promise.resolve(offer) } as unknown as OfferRepository;
    const productRepo = {
      findById: () => Promise.resolve(makeProduct({ directSaleEnabled: true })),
    } as unknown as ProductRepository;
    const settingsRepo = {
      get: () => Promise.resolve(makeSettings({ merchantCenterEnabled: false })),
    } as unknown as PlatformSettingsRepository;

    const result = await getOfferEligibility(
      { offerRepo, productRepo, settingsRepo },
      'offer-1',
      'ADMIN',
    );

    expect(result.eligible).toBe(false);
    expect(result.ineligibilityReasons).toContain('MERCHANT_CENTER_DISABLED');
  });

  it('denies a CONTENT_EDITOR (no settings.manage permission)', async () => {
    const offerRepo = {
      findById: () => {
        throw new Error('should not be called');
      },
    } as unknown as OfferRepository;
    const productRepo = {} as ProductRepository;
    const settingsRepo = {} as PlatformSettingsRepository;
    await expect(
      getOfferEligibility({ offerRepo, productRepo, settingsRepo }, 'offer-1', 'CONTENT_EDITOR'),
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe('setProductDirectSaleEnabled', () => {
  it('denies a MANAGER (no settings.manage permission)', async () => {
    const productRepo = {
      findById: () => {
        throw new Error('should not be called');
      },
    } as unknown as ProductRepository;
    await expect(
      setProductDirectSaleEnabled(
        {
          productRepo,
          auditRepo: fakeAuditRepo(),
          outboxRepo: fakeOutboxRepo(),
          uow: new InMemoryUnitOfWork(),
        },
        {
          productId: 'product-1',
          expectedVersion: 0,
          directSaleEnabled: true,
          actorUserId: 'user-1',
          actorRole: 'MANAGER',
        },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it('is a no-op (no write, no audit) when the flag already matches', async () => {
    const productRepo = {
      findById: () => Promise.resolve(makeProduct({ directSaleEnabled: true })),
      setDirectSaleEnabled: vi.fn(),
    } as unknown as ProductRepository;
    const auditRepo = fakeAuditRepo();

    await setProductDirectSaleEnabled(
      { productRepo, auditRepo, outboxRepo: fakeOutboxRepo(), uow: new InMemoryUnitOfWork() },
      {
        productId: 'product-1',
        expectedVersion: 0,
        directSaleEnabled: true,
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
      },
    );

    expect(auditRepo.calls).toHaveLength(0);
  });

  it('flips the flag and records audit + outbox with a reason', async () => {
    const productRepo = {
      findById: () => Promise.resolve(makeProduct({ directSaleEnabled: false })),
      setDirectSaleEnabled: () =>
        Promise.resolve(makeProduct({ directSaleEnabled: true, version: 1 })),
    } as unknown as ProductRepository;
    const auditRepo = fakeAuditRepo();
    const outboxRepo = fakeOutboxRepo();

    const result = await setProductDirectSaleEnabled(
      { productRepo, auditRepo, outboxRepo, uow: new InMemoryUnitOfWork() },
      {
        productId: 'product-1',
        expectedVersion: 0,
        directSaleEnabled: true,
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        reason: 'Approved for direct sale.',
      },
    );

    expect(result.directSaleEnabled).toBe(true);
    expect(auditRepo.calls[0]).toMatchObject({
      action: 'product.direct_sale_enabled_changed',
      metadata: { directSaleEnabled: true, reason: 'Approved for direct sale.' },
    });
    expect(outboxRepo.calls[0]).toMatchObject({ eventType: 'product.direct_sale_enabled_changed' });
  });
});
