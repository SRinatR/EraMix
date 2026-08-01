-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('CUSTOMER', 'MANAGER', 'CONTENT_EDITOR', 'ADMIN', 'AUDITOR');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'CUSTOMER';
