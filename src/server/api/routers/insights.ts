import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, groupProcedure, protectedProcedure } from '~/server/api/trpc';
import { getGroupMonthlySpend, getUserMonthlySpend } from '~/server/insights/queries';
import {
  MAX_TREND_MONTHS,
  MIN_TREND_MONTHS,
  compareToAverage,
  currenciesInMonth,
  getTrendWindow,
  hasAnySpend,
  monthlyTotals,
  otherCurrencyTotals,
  pickChartCurrency,
  topCategories,
} from '~/server/insights/shape';
import { pickProjectCurrency } from '~/server/project/budget';

/** Minutes from `Date#getTimezoneOffset()` on the viewer's device. */
const tzOffsetSchema = z.number().int().min(-840).max(840).optional();
const monthsSchema = z.number().int().min(MIN_TREND_MONTHS).max(MAX_TREND_MONTHS).optional();

export const insightsRouter = createTRPCRouter({
  /**
   * A project's spend for the last few months (current month last) and by category over the same
   * window, in the project's tracking currency. Other currencies are totalled, never converted.
   */
  projectSpend: groupProcedure
    .input(z.object({ tzOffset: tzOffsetSchema, months: monthsSchema }))
    .query(async ({ ctx, input }) => {
      const tzOffset = input.tzOffset ?? 0;
      const window = getTrendWindow(new Date(), tzOffset, input.months ?? 6);

      const group = await ctx.db.group.findUnique({
        where: { id: input.groupId },
        select: { budgetAmount: true, budgetCurrency: true, defaultCurrency: true },
      });
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      const rows = await getGroupMonthlySpend(ctx.db, {
        groupId: input.groupId,
        start: window.start,
        end: window.end,
        tzOffset,
      });

      // Same rule as project.summary, so the chart and the gauge use one currency.
      const currency = pickProjectCurrency({
        budgetCurrency: group.budgetCurrency,
        defaultCurrency: group.defaultCurrency,
        expenseCurrencies: currenciesInMonth(rows, window.slots.at(-1)?.key ?? ''),
      });
      const months = monthlyTotals(window.slots, rows, currency);
      const otherCurrencies = otherCurrencyTotals(rows, currency);
      const budget =
        group.budgetAmount && 0n < group.budgetAmount && currency === group.budgetCurrency
          ? group.budgetAmount
          : null;

      return {
        currency,
        budget,
        months,
        categories: topCategories(rows, currency),
        otherCurrencies,
        hasData: hasAnySpend(months, otherCurrencies),
      };
    }),

  /**
   * The signed-in user's own share of spending per month across all their groups, ending with the
   * current month, plus how this month compares with the average of the earlier months.
   */
  mySpendTrend: protectedProcedure
    .input(z.object({ tzOffset: tzOffsetSchema, months: monthsSchema }).optional())
    .query(async ({ ctx, input }) => {
      const tzOffset = input?.tzOffset ?? 0;
      const window = getTrendWindow(new Date(), tzOffset, input?.months ?? 7);
      const userId = ctx.session.user.id;

      const [rows, user] = await Promise.all([
        getUserMonthlySpend(ctx.db, { userId, start: window.start, end: window.end, tzOffset }),
        ctx.db.user.findUnique({
          where: { id: userId },
          select: { currency: true, defaultCurrency: true },
        }),
      ]);

      const currency = pickChartCurrency(rows, user?.defaultCurrency ?? user?.currency);
      const months = monthlyTotals(window.slots, rows, currency);
      const otherCurrencies = otherCurrencyTotals(rows, currency);

      return {
        currency,
        months,
        comparison: compareToAverage(months),
        otherCurrencies,
        hasData: hasAnySpend(months, otherCurrencies),
      };
    }),
});
