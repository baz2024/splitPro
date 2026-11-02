-- AlterTable
ALTER TABLE "public"."DetectedSubscription" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."ExpenseRecurrence" ADD COLUMN     "lastConfirmedUsedAt" TIMESTAMP(3);
