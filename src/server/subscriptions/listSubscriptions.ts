import { type PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';

import { BigMath } from '~/utils/numbers';

import {
  type RunRate,
  type SplitKind,
  type SubscriptionCadence,
  USAGE_CATEGORIES,
  type UsageSummary,
  cadenceFromCron,
  monthStart,
  monthlyAmount,
  nextRunDate,
  splitKindFromParticipants,
  summariseRunRates,
  summariseUsage,
} from './helpers';

export interface SubscriptionItem {
  id: string;
  recurrenceId: number;
  description: string;
  amount: bigint;
  currency: string;
  category: string;
  cadence: SubscriptionCadence;
  monthlyAmount: bigint;
  nextDueDate: Date | null;
  paidBy: { id: number; name: string | null; email: string | null };
  split: SplitKind;
  groupId: number | null;
  groupName: string | null;
}

export interface ProjectBudgetShare {
  currency: string;
  budget: bigint;
  /** Run-rate in the budget currency as a whole percent of the budget. */
  percent: number;
}

export interface SubscriptionsOverview {
  items: SubscriptionItem[];
  runRates: RunRate[];
  usage: UsageSummary[];
  budget: ProjectBudgetShare | null;
}

const NON_SPEND_SPLIT_TYPES = ['SETTLEMENT', 'CURRENCY_CONVERSION'] as const;

export const listSubscriptions = async (
  db: PrismaClient,
  { userId, groupId, now = new Date() }: { userId: number; groupId?: number; now?: Date },
): Promise<SubscriptionsOverview> => {
  const group = groupId
    ? await db.group.findFirst({
        where: { id: groupId, groupUsers: { some: { userId } } },
        select: { id: true, budgetAmount: true, budgetCurrency: true },
      })
    : null;

  if (groupId && !group) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a group member' });
  }

  const expenseScope = {
    deletedBy: null,
    expenseParticipants: { some: { userId } },
    ...(groupId ? { groupId } : {}),
  };

  const [recurrences, user, usageExpenses] = await Promise.all([
    db.expenseRecurrence.findMany({
      where: { expense: { some: expenseScope } },
      include: {
        job: { select: { schedule: true } },
        expense: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          where: expenseScope,
          select: {
            id: true,
            name: true,
            amount: true,
            currency: true,
            category: true,
            groupId: true,
            group: { select: { name: true } },
            paidByUser: { select: { id: true, name: true, email: true } },
            expenseParticipants: { select: { userId: true, amount: true } },
          },
        },
      },
    }),
    db.user.findUnique({ where: { id: userId }, select: { currency: true } }),
    db.expense.findMany({
      where: {
        ...expenseScope,
        recurrenceId: null,
        category: { in: [...USAGE_CATEGORIES] },
        splitType: { notIn: [...NON_SPEND_SPLIT_TYPES] },
        expenseDate: { gte: monthStart(now, -1), lt: monthStart(now, 1) },
      },
      select: {
        id: true,
        groupId: true,
        name: true,
        amount: true,
        currency: true,
        category: true,
        expenseDate: true,
      },
    }),
  ]);

  const items = recurrences
    .flatMap((recurrence) => {
      const expense = recurrence.expense[0];
      if (!expense) {
        return [];
      }
      const cadence = cadenceFromCron(recurrence.job.schedule);
      return [
        {
          id: expense.id,
          recurrenceId: recurrence.id,
          description: expense.name,
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category,
          cadence,
          monthlyAmount: monthlyAmount(expense.amount, cadence, recurrence.job.schedule, now),
          nextDueDate: nextRunDate(recurrence.job.schedule, now),
          paidBy: expense.paidByUser,
          split: splitKindFromParticipants(expense.expenseParticipants),
          groupId: expense.groupId,
          groupName: expense.group?.name ?? null,
        } satisfies SubscriptionItem,
      ];
    })
    .sort(
      (a, b) => (a.nextDueDate?.getTime() ?? Infinity) - (b.nextDueDate?.getTime() ?? Infinity),
    );

  const runRates = summariseRunRates(items, user?.currency);
  const usage = summariseUsage(usageExpenses, now);

  const budgetRunRate = runRates.find(({ currency }) => currency === group?.budgetCurrency);
  const budget =
    group?.budgetAmount && 0n < group.budgetAmount && group.budgetCurrency
      ? {
          currency: group.budgetCurrency,
          budget: group.budgetAmount,
          percent: Number(
            BigMath.roundDiv((budgetRunRate?.monthly ?? 0n) * 100n, group.budgetAmount),
          ),
        }
      : null;

  return { items, runRates, usage, budget };
};
