-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "canonicalHost" VARCHAR(255) NOT NULL,
    "forceHttps" BOOLEAN NOT NULL DEFAULT true,
    "stripTrailingSlash" BOOLEAN NOT NULL DEFAULT true,
    "organizationName" TEXT,
    "organizationLegalName" TEXT,
    "organizationEmail" TEXT,
    "organizationPhone" TEXT,
    "organizationAddress" TEXT,
    "organizationSameAs" JSONB,
    "seoDefaultTitleTemplate" TEXT,
    "seoDefaultDescriptionFallback" TEXT,
    "ogFallbackImageUrl" TEXT,
    "crawlerGlobalNoindex" BOOLEAN NOT NULL DEFAULT false,
    "googleExtendedAllowed" BOOLEAN NOT NULL DEFAULT true,
    "aiCompatibilityFilesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "analyticsConsentRequired" BOOLEAN NOT NULL DEFAULT true,
    "ga4Enabled" BOOLEAN NOT NULL DEFAULT false,
    "ga4MeasurementId" TEXT,
    "yandexMetricaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "yandexMetricaCounterId" TEXT,
    "rustAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "searchConsoleVerificationToken" TEXT,
    "yandexWebmasterVerificationToken" TEXT,
    "bingVerificationToken" TEXT,
    "indexNowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "merchantCenterEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings_history" (
    "id" UUID NOT NULL,
    "settingsId" TEXT NOT NULL DEFAULT 'singleton',
    "previousVersion" INTEGER NOT NULL,
    "previousSnapshot" JSONB NOT NULL,
    "changeReason" TEXT,
    "changedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_settings_history_settingsId_createdAt_idx" ON "platform_settings_history"("settingsId", "createdAt");

-- AddForeignKey
ALTER TABLE "platform_settings_history" ADD CONSTRAINT "platform_settings_history_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "platform_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_settings_history" ADD CONSTRAINT "platform_settings_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
