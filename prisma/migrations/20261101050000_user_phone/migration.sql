-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");
