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
  usageServiceKey,
} from './helpers';
import {
  type UsageSignalKind,
  getUsageStatus,
  lastExpenseByServiceKey,
  lastSeenByServiceKey,
  unusedCutoff,
} from './unused';

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
  /** Older than 30 days with no usage signal in the last 30 days. */
  unused: boolean;
  /** Newest usage signal (still-using tap, repo heartbeat or usage expense), if any. */
  lastUsedAt: Date | null;
  lastUsedSignal: UsageSignalKind | null;
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
  unusedCount: number;
}

const NON_SPEND_SPLIT_TYPES = ['SETTLEMENT', 'CURRENCY_CONVERSION'] as const;

const newestDate = (a: Date | undefined, b: Date | undefined): Date | null => {
  if (!a || !b) {
    return a ?? b ?? null;
  }
  return a.getTime() >= b.getTime() ? a : b;
};

interface UsageSignalMaps {
  startedByRecurrence: Map<number, Date>;
  seenByRecurrence: Map<number, Date>;
  seenByService: Map<string, Date>;
  usageByService: Map<string, Date>;
}

/**
 * Loads the data behind the "unused 30+ days" rule: when each recurrence started, repo heartbeats
 * from the subscription-monitor skill, and the user's non-recurring expenses in the last 30 days.
 * Usage expenses are user-wide (not limited to one project): use anywhere counts as use.
 */
const loadUsageSignals = async (
  db: PrismaClient,
  { userId, recurrenceIds, now }: { userId: number; recurrenceIds: number[]; now: Date },
): Promise<UsageSignalMaps> => {
  if (0 === recurrenceIds.length) {
    return {
      startedByRecurrence: new Map(),
      seenByRecurrence: new Map(),
      seenByService: new Map(),
      usageByService: new Map(),
    };
  }

  const cutoff = unusedCutoff(now);
  const [starts, detected, recentExpenses] = await Promise.all([
    db.expense.groupBy({
      by: ['recurrenceId'],
      where: { recurrenceId: { in: recurrenceIds }, deletedBy: null },
      _min: { createdAt: true },
    }),
    db.detectedSubscription.findMany({
      where: { userId, lastSeenAt: { gte: cutoff } },
      select: { fingerprint: true, service: true, lastSeenAt: true, expenseId: true },
    }),
    db.expense.findMany({
      where: {
        deletedBy: null,
        recurrenceId: null,
        expenseParticipants: { some: { userId } },
        splitType: { notIn: [...NON_SPEND_SPLIT_TYPES] },
        expenseDate: { gte: cutoff, lte: now },
      },
      select: { name: true, expenseDate: true },
    }),
  ]);

  const linkedExpenseIds = detected.flatMap(({ expenseId }) => (expenseId ? [expenseId] : []));
  const linkedExpenses =
    0 < linkedExpenseIds.length
      ? await db.expense.findMany({
          where: { id: { in: linkedExpenseIds }, recurrenceId: { in: recurrenceIds } },
          select: { id: true, recurrenceId: true },
        })
      : [];
  const recurrenceByExpenseId = new Map(
    linkedExpenses.map(({ id, recurrenceId }) => [id, recurrenceId] as const),
  );

  const seenByRecurrence = detected.reduce((acc, row) => {
    const recurrenceId = row.expenseId ? recurrenceByExpenseId.get(row.expenseId) : null;
    if (!recurrenceId || !row.lastSeenAt) {
      return acc;
    }
    acc.set(recurrenceId, newestDate(acc.get(recurrenceId), row.lastSeenAt) ?? row.lastSeenAt);
    return acc;
  }, new Map<number, Date>());

  const startedByRecurrence = starts.reduce((acc, { recurrenceId, _min }) => {
    if (recurrenceId && _min.createdAt) {
      acc.set(recurrenceId, _min.createdAt);
    }
    return acc;
  }, new Map<number, Date>());

  return {
    startedByRecurrence,
    seenByRecurrence,
    seenByService: lastSeenByServiceKey(detected),
    usageByService: lastExpenseByServiceKey(recentExpenses),
  };
};

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

  const signals = await loadUsageSignals(db, {
    userId,
    recurrenceIds: recurrences.map(({ id }) => id),
    now,
  });

  const items = recurrences
    .flatMap((recurrence) => {
      const expense = recurrence.expense[0];
      if (!expense) {
        return [];
      }
      const cadence = cadenceFromCron(recurrence.job.schedule);
      const serviceKey = usageServiceKey(expense.name);
      const seenViaLink = signals.seenByRecurrence.get(recurrence.id);
      const seenViaService = signals.seenByService.get(serviceKey);
      const usage = getUsageStatus(
        {
          startedAt: signals.startedByRecurrence.get(recurrence.id) ?? null,
          lastConfirmedUsedAt: recurrence.lastConfirmedUsedAt,
          lastSeenInRepoAt: newestDate(seenViaLink, seenViaService),
          lastUsageExpenseAt: signals.usageByService.get(serviceKey) ?? null,
        },
        now,
      );
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
          unused: usage.unused,
          lastUsedAt: usage.lastUsedAt,
          lastUsedSignal: usage.lastUsedSignal,
        } satisfies SubscriptionItem,
      ];
    })
    .sort(
      (a, b) => (a.nextDueDate?.getTime() ?? Infinity) - (b.nextDueDate?.getTime() ?? Infinity),
    );

  const syncedImports =
    0 < usageExpenses.length
      ? await db.billingImport.findMany({
          where: { expenseId: { in: usageExpenses.map(({ id }) => id) } },
          select: { expenseId: true, connection: { select: { provider: true } } },
        })
      : [];
  const providerByExpenseId = new Map(
    syncedImports.flatMap(({ expenseId, connection }) =>
      expenseId ? [[expenseId, connection.provider] as const] : [],
    ),
  );

  const runRates = summariseRunRates(items, user?.currency);
  const usage = summariseUsage(
    usageExpenses.map((expense) =>
      Object.assign(expense, { syncedFrom: providerByExpenseId.get(expense.id) ?? null }),
    ),
    now,
  );

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

  return {
    items,
    runRates,
    usage,
    budget,
    unusedCount: items.filter((item) => item.unused).length,
  };
};
