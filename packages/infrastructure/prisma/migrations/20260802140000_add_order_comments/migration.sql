-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateTable
CREATE TABLE "order_comments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "visibility" "CommentVisibility" NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_comments_orderId_createdAt_idx" ON "order_comments"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual addition (Prisma has no schema.prisma attribute for a CHECK
-- constraint — same convention as order_line_quantity_positive/
-- product_asset_size_positive in prior migrations): defense-in-depth against
-- an empty/whitespace-only comment body reaching the database, on top of the
-- application-boundary zod validation.
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comment_body_not_blank" CHECK (length(trim("body")) > 0);

