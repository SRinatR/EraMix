-- AlterTable
ALTER TABLE "contents" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "retirementReason" TEXT;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "retirementReason" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "retirementReason" TEXT;

-- Manual addition (same pattern as product_asset_size_positive/
-- order_comment_body_not_blank in prior migrations): CLAUDE.md requires HTTP
-- 410 only for an explicit, durable "permanently retired" state, never
-- merely because content is unpublished — packages/application/src/
-- publication.ts's retireCategory/retireContent/retireProduct only ever set
-- retiredAt on an already-ARCHIVED row and never move a retired row back to
-- DRAFT/PUBLISHED, but this CHECK constraint is the data-layer guarantee
-- that holds no matter which layer produced the write.
ALTER TABLE "contents" ADD CONSTRAINT "content_retired_requires_archived" CHECK ("retiredAt" IS NULL OR "status" = 'ARCHIVED');

ALTER TABLE "categories" ADD CONSTRAINT "category_retired_requires_archived" CHECK ("retiredAt" IS NULL OR "status" = 'ARCHIVED');

ALTER TABLE "products" ADD CONSTRAINT "product_retired_requires_archived" CHECK ("retiredAt" IS NULL OR "status" = 'ARCHIVED');

-- retirementReason must accompany retiredAt and never be blank when present.
ALTER TABLE "contents" ADD CONSTRAINT "content_retirement_reason_pair" CHECK (("retiredAt" IS NULL) = ("retirementReason" IS NULL) AND ("retirementReason" IS NULL OR length(trim("retirementReason")) > 0));

ALTER TABLE "categories" ADD CONSTRAINT "category_retirement_reason_pair" CHECK (("retiredAt" IS NULL) = ("retirementReason" IS NULL) AND ("retirementReason" IS NULL OR length(trim("retirementReason")) > 0));

ALTER TABLE "products" ADD CONSTRAINT "product_retirement_reason_pair" CHECK (("retiredAt" IS NULL) = ("retirementReason" IS NULL) AND ("retirementReason" IS NULL OR length(trim("retirementReason")) > 0));
