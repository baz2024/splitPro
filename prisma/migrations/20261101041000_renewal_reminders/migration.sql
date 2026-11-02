-- AlterTable
ALTER TABLE "public"."ExpenseRecurrence" ADD COLUMN     "lastReminderSentFor" TIMESTAMP(3),
ADD COLUMN     "remindDaysBefore" INTEGER;
