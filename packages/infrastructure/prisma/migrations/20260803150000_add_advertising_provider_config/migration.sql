-- CreateEnum
CREATE TYPE "AdvertisingProvider" AS ENUM ('GOOGLE_ADS', 'YANDEX_DIRECT', 'MICROSOFT_ADS', 'META', 'LINKEDIN', 'TIKTOK');

-- CreateEnum
CREATE TYPE "ConsentCategory" AS ENUM ('ANALYTICS', 'ADVERTISING');

-- CreateTable
CREATE TABLE "advertising_provider_configs" (
    "id" UUID NOT NULL,
    "provider" "AdvertisingProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "consentCategory" "ConsentCategory" NOT NULL DEFAULT 'ADVERTISING',
    "accountId" TEXT,
    "containerId" TEXT,
    "pixelId" TEXT,
    "credentialSecretRef" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "advertising_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "advertising_provider_configs_provider_key" ON "advertising_provider_configs"("provider");

-- Manual addition (same pattern as prior migrations' CHECK constraints):
-- CLAUDE.md's advertising control plane may never activate a provider with
-- nothing to integrate — packages/domain/src/advertising.ts's
-- validateEffectiveAdvertisingProviderConfig is the application-layer half
-- of this guarantee; this CHECK is the data-layer half, holding no matter
-- which layer produced the write.
ALTER TABLE "advertising_provider_configs" ADD CONSTRAINT "advertising_provider_requires_identifier_when_enabled" CHECK (NOT "enabled" OR "accountId" IS NOT NULL OR "containerId" IS NOT NULL OR "pixelId" IS NOT NULL);
