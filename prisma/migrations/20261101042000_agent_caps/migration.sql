-- AlterTable
ALTER TABLE "public"."ApiKey" ADD COLUMN     "agentLabel" TEXT,
ADD COLUMN     "capCurrency" TEXT,
ADD COLUMN     "groupId" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "monthlyCapAmount" BIGINT;

-- AlterTable
ALTER TABLE "public"."Expense" ADD COLUMN     "agentIdempotencyKey" TEXT,
ADD COLUMN     "reportedByApiKeyId" TEXT;

-- CreateIndex
CREATE INDEX "ApiKey_groupId_idx" ON "public"."ApiKey"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reportedByApiKeyId_agentIdempotencyKey_key" ON "public"."Expense"("reportedByApiKeyId", "agentIdempotencyKey");

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_reportedByApiKeyId_fkey" FOREIGN KEY ("reportedByApiKeyId") REFERENCES "public"."ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
