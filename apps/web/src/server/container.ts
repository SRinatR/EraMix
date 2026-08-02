import { SystemClock } from '@eramix/application';
import {
  CryptoIdGenerator,
  DevMalwareScanner,
  JsonLogger,
  LocalFilesystemStorageProvider,
  OidcIdentityProvider,
  PendingAuthCodec,
  PrismaAdvertisingProviderConfigRepository,
  PrismaAuditEventRepository,
  PrismaCategoryRepository,
  PrismaCompanyRepository,
  PrismaContentRepository,
  PrismaMembershipRepository,
  PrismaOfferRepository,
  PrismaOrderCommentRepository,
  PrismaOrderRepository,
  PrismaOutboxMessageRepository,
  PrismaPlatformSettingsHistoryRepository,
  PrismaPlatformSettingsRepository,
  PrismaProductAssetRepository,
  PrismaProductRepository,
  PrismaUnitOfWork,
  PrismaUserRepository,
  SessionCodec,
  createPrismaClient,
  loadEnv,
} from '@eramix/infrastructure';
import path from 'node:path';

/**
 * Composition root for apps/web's server-side code (route handlers, Server
 * Components). Built lazily and cached per server process — constructing a
 * PrismaClient at module-load time would make `next build` (which never
 * executes route handlers, but does import modules while collecting page
 * data) fail without a reachable database. Nothing here is safe to import
 * from a Client Component; only route handlers / Server Components may use it.
 */
function buildContainer() {
  const env = loadEnv();
  const prisma = createPrismaClient(env.DATABASE_URL);
  const logger = new JsonLogger();

  return {
    env,
    prisma,
    uow: new PrismaUnitOfWork(prisma),
    clock: new SystemClock(),
    idGen: new CryptoIdGenerator(),
    scanner: new DevMalwareScanner(logger),
    /**
     * Honest scan-engine provenance recorded on every ProductAsset
     * (CLAUDE.md: "do not falsely claim files were scanned") — only
     * DevMalwareScanner exists pending ADR-0006/Q-06; this string must be
     * updated the moment a real scanner is wired.
     */
    malwareScanEngineName:
      'dev-stub (EICAR-only detection, not production-grade — ADR-0006 pending)',
    users: new PrismaUserRepository(prisma),
    companies: new PrismaCompanyRepository(prisma),
    memberships: new PrismaMembershipRepository(prisma),
    categories: new PrismaCategoryRepository(prisma),
    products: new PrismaProductRepository(prisma),
    productAssets: new PrismaProductAssetRepository(prisma),
    content: new PrismaContentRepository(prisma),
    orders: new PrismaOrderRepository(prisma),
    orderComments: new PrismaOrderCommentRepository(prisma),
    auditEvents: new PrismaAuditEventRepository(prisma),
    outbox: new PrismaOutboxMessageRepository(prisma),
    settingsRepo: new PrismaPlatformSettingsRepository(prisma),
    settingsHistoryRepo: new PrismaPlatformSettingsHistoryRepository(prisma),
    advertisingProviders: new PrismaAdvertisingProviderConfigRepository(prisma),
    offers: new PrismaOfferRepository(prisma),
    get identityProvider() {
      if (env.OIDC_ISSUER_URL === undefined || env.OIDC_CLIENT_ID === undefined) {
        throw new Error(
          'OIDC is not configured (OIDC_ISSUER_URL/OIDC_CLIENT_ID missing) — pending ADR-0003/Q-01.',
        );
      }
      return new OidcIdentityProvider({
        issuer: env.OIDC_ISSUER_URL,
        clientId: env.OIDC_CLIENT_ID,
        ...(env.OIDC_CLIENT_SECRET !== undefined ? { clientSecret: env.OIDC_CLIENT_SECRET } : {}),
      });
    },
    get sessionCodec() {
      if (env.SESSION_SECRET === undefined) {
        throw new Error('SESSION_SECRET is not configured — required for /api/auth/*.');
      }
      return new SessionCodec(env.SESSION_SECRET);
    },
    get pendingAuthCodec() {
      if (env.SESSION_SECRET === undefined) {
        throw new Error('SESSION_SECRET is not configured — required for /api/auth/*.');
      }
      return new PendingAuthCodec(env.SESSION_SECRET);
    },
    get storage() {
      if (env.MEDIA_SIGNING_SECRET === undefined) {
        throw new Error('MEDIA_SIGNING_SECRET is not configured — required for /api/media/*.');
      }
      const publicOrigin = env.PUBLIC_ORIGIN ?? 'https://eramix.example';
      return new LocalFilesystemStorageProvider(
        path.resolve(env.MEDIA_STORAGE_DIR),
        new URL('/api/media/download', publicOrigin).toString(),
        env.MEDIA_SIGNING_SECRET,
      );
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= buildContainer();
  return cached;
}
