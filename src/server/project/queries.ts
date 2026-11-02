import { type PrismaClient, SplitType } from '@prisma/client';

import { type BudgetExpense } from './budget';

/** Settlements and currency conversions move money between people; they are not spend. */
export const NON_SPEND_SPLIT_TYPES = [SplitType.SETTLEMENT, SplitType.CURRENCY_CONVERSION];

export const getMonthExpenses = async (
  db: PrismaClient,
  groupIds: number[],
  start: Date,
  end: Date,
): Promise<(BudgetExpense & { groupId: number })[]> => {
  if (0 === groupIds.length) {
    return [];
  }
  const rows = await db.expense.findMany({
    where: {
      groupId: { in: groupIds },
      deletedBy: null,
      splitType: { notIn: NON_SPEND_SPLIT_TYPES },
      expenseDate: { gte: start, lt: end },
    },
    select: {
      groupId: true,
      amount: true,
      currency: true,
      category: true,
      recurrenceId: true,
      reportedByApiKeyId: true,
    },
  });

  return rows.map((row) => ({
    groupId: row.groupId ?? 0,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    isRecurring: null !== row.recurrenceId,
    reportedByApiKeyId: row.reportedByApiKeyId,
  }));
};
