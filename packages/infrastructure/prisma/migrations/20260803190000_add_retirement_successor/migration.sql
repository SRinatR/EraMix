-- AlterTable
ALTER TABLE "contents" ADD COLUMN     "successorId" UUID;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "successorId" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "successorId" UUID;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual additions (same pattern as *_retired_requires_archived/
-- *_retirement_reason_pair in migration 20260803120000_add_retirement_state):
-- search-visibility.md: "a 308 is used only for a materially equivalent
-- canonical replacement" — a successor is only ever meaningful on an
-- already-retired row, and a row can never name itself as its own successor.
ALTER TABLE "contents" ADD CONSTRAINT "content_successor_requires_retired" CHECK ("successorId" IS NULL OR "retiredAt" IS NOT NULL);
ALTER TABLE "categories" ADD CONSTRAINT "category_successor_requires_retired" CHECK ("successorId" IS NULL OR "retiredAt" IS NOT NULL);
ALTER TABLE "products" ADD CONSTRAINT "product_successor_requires_retired" CHECK ("successorId" IS NULL OR "retiredAt" IS NOT NULL);

ALTER TABLE "contents" ADD CONSTRAINT "content_successor_not_self" CHECK ("successorId" IS NULL OR "successorId" != "id");
ALTER TABLE "categories" ADD CONSTRAINT "category_successor_not_self" CHECK ("successorId" IS NULL OR "successorId" != "id");
ALTER TABLE "products" ADD CONSTRAINT "product_successor_not_self" CHECK ("successorId" IS NULL OR "successorId" != "id");
