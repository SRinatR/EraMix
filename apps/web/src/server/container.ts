import { SystemClock } from '@eramix/application';
import {
  CryptoIdGenerator,
  OidcIdentityProvider,
  PendingAuthCodec,
  PrismaAuditEventRepository,
  PrismaCategoryRepository,
  PrismaCompanyRepository,
  PrismaContentRepository,
  PrismaMembershipRepository,
  PrismaOrderRepository,
  PrismaOutboxMessageRepository,
  PrismaProductRepository,
  PrismaUnitOfWork,
  PrismaUserRepository,
  SessionCodec,
  createPrismaClient,
  loadEnv,
} from '@eramix/infrastructure';

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

  return {
    env,
    prisma,
    uow: new PrismaUnitOfWork(prisma),
    clock: new SystemClock(),
    idGen: new CryptoIdGenerator(),
    users: new PrismaUserRepository(prisma),
    companies: new PrismaCompanyRepository(prisma),
    memberships: new PrismaMembershipRepository(prisma),
    categories: new PrismaCategoryRepository(prisma),
    products: new PrismaProductRepository(prisma),
    content: new PrismaContentRepository(prisma),
    orders: new PrismaOrderRepository(prisma),
    auditEvents: new PrismaAuditEventRepository(prisma),
    outbox: new PrismaOutboxMessageRepository(prisma),
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
  };
}

export type Container = ReturnType<typeof buildContainer>;

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= buildContainer();
  return cached;
}
