-- Product media/document attachments (Phase 6 media/documents deliverable).
-- Tool-generated portion below via:
--   prisma migrate diff --from-schema <previous committed schema.prisma>
--     --to-schema prisma/schema.prisma --script
-- (fully offline, no live database needed), with two manual CHECK
-- constraints appended — Prisma has no schema.prisma attribute for either,
-- same pattern as the init migration's order_line_quantity_positive /
-- product_translation_price_currency_pair additions.

-- CreateEnum
CREATE TYPE "ProductAssetType" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "MalwareScanStatus" AS ENUM ('CLEAN', 'INFECTED');

-- CreateTable
CREATE TABLE "product_assets" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "assetType" "ProductAssetType" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "storageKey" VARCHAR(255) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "locale" "Locale",
    "altText" VARCHAR(255),
    "caption" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "malwareScanStatus" "MalwareScanStatus" NOT NULL,
    "malwareScanEngine" VARCHAR(160) NOT NULL,
    "uploadedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_assets_storageKey_key" ON "product_assets"("storageKey");

-- CreateIndex
CREATE INDEX "product_assets_productId_assetType_status_sortOrder_idx" ON "product_assets"("productId", "assetType", "status", "sortOrder");

-- AddForeignKey
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual addition: sizeBytes must be a positive integer (mirrored at the
-- domain layer by packages/domain/src/upload-validation.ts's validateUpload,
-- MAX_UPLOAD_SIZE_BYTES ceiling).
ALTER TABLE "product_assets" ADD CONSTRAINT "product_asset_size_positive" CHECK ("sizeBytes" > 0);

-- Manual addition: sortOrder is a display-order index, never negative
-- (mirrored at the application layer by packages/application/src/
-- product-assets.ts's reorderProductAssets).
ALTER TABLE "product_assets" ADD CONSTRAINT "product_asset_sort_order_non_negative" CHECK ("sortOrder" >= 0);
