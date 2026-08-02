-- Backs optimistic concurrency for the new "edit an existing translation"
-- use case (packages/application/src/translation-edit.ts). Translations
-- previously had no version column of their own — only the parent
-- Category/Product/Content aggregate did (used by updateStatus) — so an
-- edit-translation OCC guard had nothing to key off. Tool-generated via:
--   prisma migrate diff --from-schema <previous committed schema.prisma>
--     --to-schema prisma/schema.prisma --script
-- (fully offline, no live database needed), verified against the exact SQL
-- Prisma itself produced for this schema diff — no manual additions needed
-- this time (unlike the init/product-assets migrations, which added CHECK
-- constraints Prisma has no schema.prisma attribute for).

-- AlterTable
ALTER TABLE "content_translations" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "category_translations" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "product_translations" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
