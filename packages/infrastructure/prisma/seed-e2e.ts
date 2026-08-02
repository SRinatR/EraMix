import { isValidPublicId } from '@eramix/domain';
import { createPrismaClient } from '../src/prisma-client.js';

/**
 * Fixture-only seed for the Pi E2E/demo session — never run against a real
 * environment (this script is not wired into `db:seed`, CI, or any
 * deployment step). Real login only ever auto-creates a user as CUSTOMER
 * (apps/web/src/app/api/auth/callback/route.ts) and role promotion is an
 * ADMIN-only `users.manage` action (ADR-0014) — there is deliberately no
 * bootstrap-admin mechanism in the product itself, so an E2E suite that
 * needs to exercise MANAGER/CONTENT_EDITOR/ADMIN/AUDITOR behaviour needs
 * these rows to already exist before the first login. The (issuer, subject)
 * pairs below must match scripts/pi/oidc-fake-idp.mjs's fixed test
 * identities exactly.
 */

// Local runs go through `pnpm run db:seed:e2e`, which wraps this script with
// `dotenvx run -f ../../.env --` (see ADR-0016); the Pi scripts export
// DATABASE_URL directly instead of relying on a .env file at all.

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the E2E seed script.');
}

const FAKE_IDP_ISSUER = process.env['E2E_OIDC_ISSUER'] ?? 'http://localhost:9099';

const prisma = createPrismaClient(databaseUrl);

const TEST_USERS = [
  { subject: 'e2e-customer', email: 'customer@e2e.test', name: 'E2E Customer', role: 'CUSTOMER' },
  { subject: 'e2e-manager', email: 'manager@e2e.test', name: 'E2E Manager', role: 'MANAGER' },
  { subject: 'e2e-editor', email: 'editor@e2e.test', name: 'E2E Editor', role: 'CONTENT_EDITOR' },
  { subject: 'e2e-admin', email: 'admin@e2e.test', name: 'E2E Admin', role: 'ADMIN' },
  { subject: 'e2e-auditor', email: 'auditor@e2e.test', name: 'E2E Auditor', role: 'AUDITOR' },
] as const;

const DEMO_COMPANY_ID = '00000000-0000-4000-8000-0000000000e2';
const DEMO_CATEGORY_ID = '00000000-0000-4000-8000-0000000000e3';
const DEMO_CATEGORY_TRANSLATION_ID = '00000000-0000-4000-8000-0000000000e4';
const DEMO_PRODUCT_ID = '00000000-0000-4000-8000-0000000000e5';
const DEMO_PRODUCT_TRANSLATION_ID = '00000000-0000-4000-8000-0000000000e6';
const DEMO_PRODUCT_SKU = 'E2E-0001';
const DEMO_PRODUCT_PUBLIC_ID = 'E2E00001';
if (!isValidPublicId(DEMO_PRODUCT_PUBLIC_ID)) {
  throw new Error(
    `DEMO_PRODUCT_PUBLIC_ID "${DEMO_PRODUCT_PUBLIC_ID}" fails packages/domain's isValidPublicId — fix the fixture, don't skip this check.`,
  );
}

/**
 * A fully PUBLISHED category + product, seeded directly via Prisma (not
 * through the app's own authoring API) so the ordering/catalog E2E specs
 * have something orderable without a Pi-only fixture script having to open
 * its own authenticated actor/session context. `updateCategoryTranslation`/
 * `updateProductTranslation` (packages/application/src/translation-edit.ts)
 * now exist and can take an existing translation's seoTitle/seoDescription
 * from empty to set — the "edit an existing translation" gap this comment
 * used to name is closed — but this fixture keeps using fixed, upserted ids
 * directly via Prisma rather than the authoring API's generated ids, which
 * remains the simpler, deterministic choice for seed data specifically (not
 * a product gap).
 */
async function seedPublishedDemoProduct(): Promise<void> {
  const category = await prisma.category.upsert({
    where: { id: DEMO_CATEGORY_ID },
    create: {
      id: DEMO_CATEGORY_ID,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      translations: {
        create: [
          {
            id: DEMO_CATEGORY_TRANSLATION_ID,
            locale: 'en',
            name: 'E2E Category',
            seoTitle: 'E2E Category',
            seoDescription: 'Fixture category for the Pi E2E suite.',
          },
        ],
      },
    },
    update: {},
  });
  await prisma.categoryRoute.upsert({
    where: { locale_slug: { locale: 'en', slug: 'e2e-category' } },
    create: {
      translationId: DEMO_CATEGORY_TRANSLATION_ID,
      locale: 'en',
      slug: 'e2e-category',
      isCanonical: true,
    },
    update: {},
  });

  await prisma.product.upsert({
    where: { sku: DEMO_PRODUCT_SKU },
    create: {
      id: DEMO_PRODUCT_ID,
      publicId: DEMO_PRODUCT_PUBLIC_ID,
      sku: DEMO_PRODUCT_SKU,
      categoryId: category.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      translations: {
        create: [
          {
            id: DEMO_PRODUCT_TRANSLATION_ID,
            locale: 'en',
            name: 'E2E Fixture Product',
            slug: 'e2e-fixture-product',
            description: 'A published product that only exists for the Pi E2E suite.',
            seoTitle: 'E2E Fixture Product',
            seoDescription: 'Fixture product for the Pi E2E suite.',
            priceFromMinor: 10000,
            currency: 'USD',
            priceDisclaimer: 'from',
          },
        ],
      },
    },
    update: { status: 'PUBLISHED', publishedAt: new Date() },
  });
}

async function main(): Promise<void> {
  const company = await prisma.company.upsert({
    where: { id: DEMO_COMPANY_ID },
    create: { id: DEMO_COMPANY_ID, legalName: 'E2E Demo Company LLC', status: 'ACTIVE' },
    update: {},
  });

  await seedPublishedDemoProduct();

  for (const fixture of TEST_USERS) {
    const user = await prisma.user.upsert({
      where: { issuer_subject: { issuer: FAKE_IDP_ISSUER, subject: fixture.subject } },
      create: {
        issuer: FAKE_IDP_ISSUER,
        subject: fixture.subject,
        email: fixture.email,
        displayName: fixture.name,
        status: 'ACTIVE',
        platformRole: fixture.role,
      },
      update: { platformRole: fixture.role, status: 'ACTIVE' },
    });

    if (fixture.role === 'CUSTOMER') {
      await prisma.membership.upsert({
        where: { userId_companyId: { userId: user.id, companyId: company.id } },
        create: { userId: user.id, companyId: company.id, role: 'OWNER', status: 'ACTIVE' },
        update: { status: 'ACTIVE' },
      });
    }
  }

  console.log(
    JSON.stringify({
      msg: 'e2e seed complete',
      issuer: FAKE_IDP_ISSUER,
      users: TEST_USERS.map((u) => `${u.role}: ${u.email}`),
      companyId: company.id,
      publishedDemoProduct: {
        sku: DEMO_PRODUCT_SKU,
        publicId: DEMO_PRODUCT_PUBLIC_ID,
        slug: 'e2e-fixture-product',
      },
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(JSON.stringify({ msg: 'e2e seed failed', error: String(error) }));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
