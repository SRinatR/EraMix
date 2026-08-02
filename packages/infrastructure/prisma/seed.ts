import { generatePublicId } from '@eramix/domain';
import { createPrismaClient } from '../src/prisma-client.js';

// Seed data is intentionally minimal: User/Company/Order data would need
// real ODS Identity claims (Q-01, still open — docs/OPEN_QUESTIONS.md) or
// invented business data this repo has no authority to make up. This seeds
// only structural catalog data needed to exercise the schema end to end.

// Local runs go through `pnpm run db:seed`, which wraps this script with
// `dotenvx run -f ../../.env --` (see ADR-0016); the Pi scripts export
// DATABASE_URL directly instead of relying on a .env file at all.

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed script.');
}

const prisma = createPrismaClient(databaseUrl);

async function main(): Promise<void> {
  const category = await prisma.category.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      translations: {
        create: [
          { id: '00000000-0000-4000-8000-000000000011', locale: 'en', name: 'General' },
          { id: '00000000-0000-4000-8000-000000000012', locale: 'ru', name: 'Общее' },
          { id: '00000000-0000-4000-8000-000000000013', locale: 'uz', name: 'Umumiy' },
        ],
      },
    },
    update: {},
  });

  const enTranslation = await prisma.categoryTranslation.findUniqueOrThrow({
    where: { id: '00000000-0000-4000-8000-000000000011' },
  });

  await prisma.categoryRoute.upsert({
    where: { locale_slug: { locale: 'en', slug: 'general' } },
    create: {
      translationId: enTranslation.id,
      locale: 'en',
      slug: 'general',
      isCanonical: true,
    },
    update: {},
  });

  const sampleSku = 'SEED-0001';
  const existingProduct = await prisma.product.findUnique({ where: { sku: sampleSku } });
  if (!existingProduct) {
    await prisma.product.create({
      data: {
        publicId: generatePublicId(),
        sku: sampleSku,
        categoryId: category.id,
        status: 'DRAFT',
        translations: {
          create: [
            {
              locale: 'en',
              name: 'Sample product',
              slug: 'sample-product',
              priceFromMinor: 15000,
              currency: 'UZS',
              priceDisclaimer: 'starting from',
            },
          ],
        },
      },
    });
  }

  // PlatformSettings is a singleton row that must exist before any request
  // reads it (getPlatformSettings/robots.ts/sitemap.ts all throw
  // ResourceNotFoundError otherwise, by design — see
  // packages/infrastructure/src/repositories/platform-settings-repository.ts).
  // A conservative, no-organization-facts default: Organization JSON-LD stays
  // absent (CLAUDE.md: "only when real and maintained") until a Product Owner
  // sets a real name via /admin/settings.
  await prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', canonicalHost: 'eramix.example' },
    update: {},
  });

  // Each AdvertisingProvider (CLAUDE.md's named allowlist) always exists as
  // a row — disabled, no identifiers — never implicitly materialized on
  // read (same "seed once, never auto-create" convention as
  // PlatformSettings). A Product Owner enables/configures each one
  // explicitly via /admin/advertising.
  const ADVERTISING_PROVIDERS = [
    'GOOGLE_ADS',
    'YANDEX_DIRECT',
    'MICROSOFT_ADS',
    'META',
    'LINKEDIN',
    'TIKTOK',
  ] as const;
  for (const provider of ADVERTISING_PROVIDERS) {
    await prisma.advertisingProviderConfig.upsert({
      where: { provider },
      create: { provider },
      update: {},
    });
  }

  console.log(JSON.stringify({ msg: 'seed complete', categoryId: category.id, sampleSku }));
}

main()
  .catch((error: unknown) => {
    console.error(JSON.stringify({ msg: 'seed failed', error: String(error) }));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
