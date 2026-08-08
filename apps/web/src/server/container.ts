import { SystemClock } from '@eramix/application';
import {
  DevMalwareScanner,
  JsonLogger,
  LocalFilesystemStorageProvider,
  OidcIdentityProvider,
  PendingAuthCodec,
  PostgresUuidV7IdGenerator,
  PrismaAdvertisingProviderConfigRepository,
  PrismaAnalyticsSinkStatusRepository,
  PrismaAuditEventRepository,
  PrismaIndexNowEngineStatusRepository,
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
  R2StorageProvider,
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
    idGen: new PostgresUuidV7IdGenerator(prisma),
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
    analyticsSinkStatus: new PrismaAnalyticsSinkStatusRepository(prisma),
    indexNowEngineStatus: new PrismaIndexNowEngineStatusRepository(prisma),
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
      const r2Vars = [
        env.R2_ACCOUNT_ID,
        env.R2_BUCKET,
        env.R2_ACCESS_KEY_ID,
        env.R2_SECRET_ACCESS_KEY,
      ];
      const r2VarsSetCount = r2Vars.filter((value) => value !== undefined).length;
      if (r2VarsSetCount === 4) {
        return new R2StorageProvider({
          accountId: env.R2_ACCOUNT_ID!,
          bucket: env.R2_BUCKET!,
          accessKeyId: env.R2_ACCESS_KEY_ID!,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        });
      }
      if (r2VarsSetCount > 0) {
        throw new Error(
          'Partial R2 configuration: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must all be set together, or all left unset to fall back to local dev storage.',
        );
      }
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
