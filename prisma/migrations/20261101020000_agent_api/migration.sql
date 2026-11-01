-- CreateEnum
CREATE TYPE "public"."DetectedSubscriptionStatus" AS ENUM ('PENDING', 'ADDED', 'DISMISSED');

-- CreateTable
CREATE TABLE "public"."ApiKey" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DetectedSubscription" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "vendor" TEXT,
    "category" TEXT NOT NULL DEFAULT 'saas',
    "status" "public"."DetectedSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "detectedIn" TEXT,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedAmount" BIGINT,
    "estimatedCurrency" TEXT,
    "pricingUrl" TEXT,
    "agent" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectedSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "public"."ApiKey"("hashedKey");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "public"."ApiKey"("userId");

-- CreateIndex
CREATE INDEX "DetectedSubscription_userId_status_idx" ON "public"."DetectedSubscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DetectedSubscription_userId_fingerprint_key" ON "public"."DetectedSubscription"("userId", "fingerprint");

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DetectedSubscription" ADD CONSTRAINT "DetectedSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Block Supabase's public Data API (anon/authenticated roles) from the new tables.
-- The app connects as the table owner, which bypasses RLS, so app behaviour is unchanged.
ALTER TABLE "public"."ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DetectedSubscription" ENABLE ROW LEVEL SECURITY;
