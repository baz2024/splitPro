-- CreateEnum
CREATE TYPE "public"."BillingProvider" AS ENUM ('VERCEL', 'SUPABASE');

-- CreateTable
CREATE TABLE "public"."BillingConnection" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL,
    "groupId" INTEGER,
    "externalAccountId" TEXT,
    "label" TEXT,
    "encryptedToken" TEXT NOT NULL,
    "tokenLast4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillingImport" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "expenseId" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingConnection_provider_status_idx" ON "public"."BillingConnection"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingConnection_userId_provider_externalAccountId_key" ON "public"."BillingConnection"("userId", "provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingImport_connectionId_periodKey_key" ON "public"."BillingImport"("connectionId", "periodKey");

-- AddForeignKey
ALTER TABLE "public"."BillingConnection" ADD CONSTRAINT "BillingConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingImport" ADD CONSTRAINT "BillingImport_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."BillingConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Block Supabase's public Data API (anon/authenticated roles) from the new tables.
-- The app connects as the table owner, which bypasses RLS, so app behaviour is unchanged.
ALTER TABLE "public"."BillingConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BillingImport" ENABLE ROW LEVEL SECURITY;
