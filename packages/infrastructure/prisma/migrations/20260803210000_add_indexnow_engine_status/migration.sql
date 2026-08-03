-- CreateTable
CREATE TABLE "indexnow_engine_status" (
    "engine" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastSucceeded" BOOLEAN NOT NULL,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "lastUrlCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indexnow_engine_status_pkey" PRIMARY KEY ("engine")
);
