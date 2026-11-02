-- AlterTable: statement scan (subscriptions detected from bank / card statements and invoice exports)
ALTER TABLE "public"."DetectedSubscription" ADD COLUMN     "source" TEXT,
ADD COLUMN     "cadence" TEXT,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastChargedAt" TIMESTAMP(3),
ADD COLUMN     "nextRenewalAt" TIMESTAMP(3),
ADD COLUMN     "chargeCount" INTEGER,
ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "previousAmount" BIGINT,
ADD COLUMN     "yearlyAmount" BIGINT,
ADD COLUMN     "atRiskYearly" BIGINT,
ADD COLUMN     "confidence" TEXT,
ADD COLUMN     "duplicateOf" TEXT,
ADD COLUMN     "scanId" TEXT,
ADD COLUMN     "vendorMatch" JSONB,
ADD COLUMN     "decision" TEXT;

-- CreateIndex
CREATE INDEX "DetectedSubscription_userId_scanId_idx" ON "public"."DetectedSubscription"("userId", "scanId");
