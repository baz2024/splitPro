-- AlterTable: agent key controls (pause, last four token characters for display, allow-list)
ALTER TABLE "public"."ApiKey" ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "lastFour" TEXT,
ADD COLUMN     "allowList" TEXT[] DEFAULT ARRAY[]::TEXT[];
