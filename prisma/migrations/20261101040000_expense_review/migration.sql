-- AlterTable
ALTER TABLE "public"."Expense" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
