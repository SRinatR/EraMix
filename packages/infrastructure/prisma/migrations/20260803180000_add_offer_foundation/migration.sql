-- CreateEnum
CREATE TYPE "OfferState" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OfferAvailability" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'BACKORDER', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "TaxDisplayPolicy" AS ENUM ('TAX_INCLUDED', 'TAX_EXCLUDED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "directSaleEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "state" "OfferState" NOT NULL DEFAULT 'DRAFT',
    "sellerName" VARCHAR(255) NOT NULL,
    "sellerUrl" TEXT,
    "priceAmountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "taxDisplayPolicy" "TaxDisplayPolicy" NOT NULL,
    "availability" "OfferAvailability" NOT NULL,
    "availableFrom" TIMESTAMP(3),
    "inventoryQuantity" INTEGER,
    "sku" VARCHAR(64) NOT NULL,
    "gtin" VARCHAR(64),
    "mpn" VARCHAR(64),
    "brand" VARCHAR(255),
    "eligibleCountries" JSONB NOT NULL,
    "deliveryPolicyRef" TEXT,
    "returnPolicyRef" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "checkoutUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_productId_state_idx" ON "offers"("productId", "state");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual additions (ADR-0019, same pattern as prior migrations' CHECK
-- constraints): the data-layer half of the domain validator
-- (packages/domain/src/offer.ts's validateEffectiveOffer). Cross-table
-- invariants (an Offer's parent Product.directSaleEnabled) cannot be
-- expressed as a Postgres CHECK constraint (no cross-table CHECK support
-- without a trigger, which this codebase has no existing precedent for and
-- is out of scope for this dormant foundation slice) — that invariant is
-- enforced only at the domain/application layer, documented here rather
-- than silently assumed.

ALTER TABLE "offers" ADD CONSTRAINT "offer_price_positive" CHECK ("priceAmountMinor" > 0);

ALTER TABLE "offers" ADD CONSTRAINT "offer_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "offers" ADD CONSTRAINT "offer_seller_name_not_blank" CHECK (length(trim("sellerName")) > 0);

ALTER TABLE "offers" ADD CONSTRAINT "offer_inventory_non_negative" CHECK ("inventoryQuantity" IS NULL OR "inventoryQuantity" >= 0);

-- No contradictory stock/availability state (CLAUDE.md).
ALTER TABLE "offers" ADD CONSTRAINT "offer_availability_stock_consistency" CHECK (
  ("availability" != 'OUT_OF_STOCK' OR "inventoryQuantity" IS NULL OR "inventoryQuantity" = 0)
  AND ("availability" != 'IN_STOCK' OR "inventoryQuantity" IS NULL OR "inventoryQuantity" > 0)
  AND ("availability" NOT IN ('PREORDER', 'BACKORDER') OR "availableFrom" IS NOT NULL)
);

-- effectiveTo must be strictly after effectiveFrom when set (the
-- write-time half of "no expired offer" — the "currently past its
-- effectiveTo" check is a runtime/feed-eligibility concern, not a static
-- CHECK, since Postgres CHECK constraints cannot depend on now()).
ALTER TABLE "offers" ADD CONSTRAINT "offer_effective_date_order" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- No published/syndicatable offer without a real checkout URL or policy
-- references (CLAUDE.md).
ALTER TABLE "offers" ADD CONSTRAINT "offer_published_requires_checkout_url" CHECK ("state" != 'PUBLISHED' OR "checkoutUrl" IS NOT NULL);

ALTER TABLE "offers" ADD CONSTRAINT "offer_published_requires_policy_refs" CHECK ("state" != 'PUBLISHED' OR ("deliveryPolicyRef" IS NOT NULL AND "returnPolicyRef" IS NOT NULL));
