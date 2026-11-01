-- AlterTable
ALTER TABLE "public"."Group" ADD COLUMN     "budgetAmount" BIGINT,
ADD COLUMN     "budgetCurrency" TEXT,
ADD COLUMN     "budgetSource" TEXT;
