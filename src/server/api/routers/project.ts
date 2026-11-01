import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { CURRENCIES, isCurrencyCode } from '~/lib/currency';
import { createTRPCRouter, groupProcedure, protectedProcedure } from '~/server/api/trpc';
import {
  getBudgetStatus,
  getMonthWindow,
  getSafeToSpendPerDay,
  isDueWithin,
  parseDecimalToMinor,
  pickProjectCurrency,
  summarizeSpend,
} from '~/server/project/budget';
import { NON_SPEND_SPLIT_TYPES, getMonthExpenses } from '~/server/project/queries';

const RENEWAL_WINDOW_DAYS = 7;

/** Minutes from `Date#getTimezoneOffset()` on the viewer's device. */
const tzOffsetSchema = z.number().int().min(-840).max(840).optional();

export const projectRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ tzOffset: tzOffsetSchema }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const window = getMonthWindow(now, input?.tzOffset);

      const memberships = await ctx.db.groupUser.findMany({
        where: { userId: ctx.session.user.id, group: { archivedAt: null } },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              defaultCurrency: true,
              budgetAmount: true,
              budgetCurrency: true,
              budgetSource: true,
              groupUsers: { select: { userId: true } },
            },
          },
        },
        orderBy: { group: { name: 'asc' } },
      });

      const groups = memberships.map((m) => m.group);
      const expenses = await getMonthExpenses(
        ctx.db,
        groups.map((g) => g.id),
        window.start,
        window.end,
      );

      return groups.map((group) => {
        const groupExpenses = expenses.filter((e) => e.groupId === group.id);
        const currency = pickProjectCurrency({
          budgetCurrency: group.budgetCurrency,
          defaultCurrency: group.defaultCurrency,
          expenseCurrencies: groupExpenses.map((e) => e.currency),
        });
        const { spent, skippedOtherCurrencies } = summarizeSpend(groupExpenses, currency);
        const budget = group.budgetAmount;

        return {
          id: group.id,
          name: group.name,
          memberCount: group.groupUsers.length,
          currency,
          spent,
          budget,
          budgetSource: group.budgetSource,
          left: null === budget ? null : budget - spent,
          status: getBudgetStatus({
            budget,
            spent,
            dayOfMonth: window.dayOfMonth,
            daysInMonth: window.daysInMonth,
          }),
          skippedOtherCurrencies,
          daysLeft: window.daysLeft,
        };
      });
    }),

  summary: groupProcedure
    .input(z.object({ tzOffset: tzOffsetSchema }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const window = getMonthWindow(now, input.tzOffset);

      const group = await ctx.db.group.findUnique({
        where: { id: input.groupId },
        include: {
          groupUsers: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      });

      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      const memberIds = group.groupUsers.map((gu) => gu.userId);

      const [expenses, recurringExpenses, agentsCount, todayExpenses] = await Promise.all([
        getMonthExpenses(ctx.db, [group.id], window.start, window.end),
        ctx.db.expense.findMany({
          where: { groupId: group.id, deletedBy: null, recurrenceId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: {
            recurrenceId: true,
            amount: true,
            currency: true,
            recurrence: { select: { job: { select: { schedule: true, active: true } } } },
          },
        }),
        ctx.db.apiKey.count({ where: { userId: { in: memberIds }, revokedAt: null } }),
        ctx.db.expense.findMany({
          where: {
            groupId: group.id,
            deletedBy: null,
            splitType: { notIn: NON_SPEND_SPLIT_TYPES },
            createdAt: { gte: window.todayStart },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            name: true,
            amount: true,
            currency: true,
            category: true,
            createdAt: true,
            fileKey: true,
            recurrenceId: true,
            paidByUser: { select: { id: true, name: true, email: true, image: true } },
          },
        }),
      ]);

      const currency = pickProjectCurrency({
        budgetCurrency: group.budgetCurrency,
        defaultCurrency: group.defaultCurrency,
        expenseCurrencies: expenses.map((e) => e.currency),
      });
      const { spent, buckets, skippedOtherCurrencies } = summarizeSpend(expenses, currency);
      const budget = group.budgetAmount;
      const left = null === budget ? null : budget - spent;

      // One renewal per recurrence: the newest expense carries the current amount.
      const latestPerRecurrence = recurringExpenses.filter(
        (expense, index, all) =>
          all.findIndex((other) => other.recurrenceId === expense.recurrenceId) === index,
      );
      const dueSoon = latestPerRecurrence.filter((expense) => {
        const job = expense.recurrence?.job;
        return Boolean(job?.active) && isDueWithin(job!.schedule, now, RENEWAL_WINDOW_DAYS);
      });
      const renewalsDue = {
        count: dueSoon.length,
        total: dueSoon
          .filter((expense) => currency === expense.currency)
          .reduce((sum, expense) => sum + expense.amount, 0n),
        skippedOtherCurrencies: dueSoon.some((expense) => currency !== expense.currency),
      };

      return {
        id: group.id,
        name: group.name,
        currency,
        budget,
        budgetSource: group.budgetSource,
        spent,
        left,
        status: getBudgetStatus({
          budget,
          spent,
          dayOfMonth: window.dayOfMonth,
          daysInMonth: window.daysInMonth,
        }),
        month: window.month,
        year: window.year,
        daysLeft: window.daysLeft,
        safeToSpendPerDay: null === left ? null : getSafeToSpendPerDay(left, window.daysLeft),
        renewalsDue,
        whereItGoes: buckets,
        skippedOtherCurrencies,
        members: group.groupUsers.map((gu) => gu.user),
        agentsCount,
        today: todayExpenses.map((expense) => ({
          id: expense.id,
          description: expense.name,
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category,
          createdAt: expense.createdAt,
          paidBy: expense.paidByUser,
          hasReceipt: null !== expense.fileKey,
          isRecurring: null !== expense.recurrenceId,
        })),
      };
    }),

  setBudget: groupProcedure
    .input(z.object({ amount: z.string().min(1).max(32), currency: z.string().min(3).max(3) }))
    .mutation(async ({ ctx, input }) => {
      if (!isCurrencyCode(input.currency)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown currency' });
      }
      const amount = parseDecimalToMinor(input.amount, CURRENCIES[input.currency].decimalDigits);
      if (null === amount || 0n >= amount) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Budget must be a positive amount' });
      }

      await ctx.db.group.update({
        where: { id: input.groupId },
        data: { budgetAmount: amount, budgetCurrency: input.currency, budgetSource: 'manual' },
      });

      return { budget: amount, currency: input.currency };
    }),

  clearBudget: groupProcedure.mutation(async ({ ctx, input }) => {
    await ctx.db.group.update({
      where: { id: input.groupId },
      data: { budgetAmount: null, budgetCurrency: null, budgetSource: null },
    });
    return { ok: true };
  }),
});
