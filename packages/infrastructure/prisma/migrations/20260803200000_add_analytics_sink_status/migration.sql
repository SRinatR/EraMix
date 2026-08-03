-- CreateTable
CREATE TABLE "analytics_sink_status" (
    "sink" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastSucceeded" BOOLEAN NOT NULL,
    "lastSkipped" BOOLEAN NOT NULL,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_sink_status_pkey" PRIMARY KEY ("sink")
);
