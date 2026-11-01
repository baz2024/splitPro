import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { RANGE_PERIODS, SPEND_RANGES } from '~/lib/spendRange';
import { createTRPCRouter, groupProcedure, protectedProcedure } from '~/server/api/trpc';
import { getGroupPeriodSpend, getUserMonthlySpend } from '~/server/insights/queries';
import {
  MAX_TREND_MONTHS,
  MIN_TREND_MONTHS,
  type MonthSlot,
  averagePerPeriod,
  compareToAverage,
  currenciesInMonth,
  getDailyWindow,
  getTrendWindow,
  hasAnySpend,
  monthKeyOf,
  monthlyTotals,
  otherCurrencyTotals,
  periodTotals,
  pickChartCurrency,
  topCategories,
  topCategoriesBySource,
  totalsBySource,
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
    .input(
      z.object({
        tzOffset: tzOffsetSchema,
        months: monthsSchema,
        /** 1M = daily bars for the last 30 days; 6M / 1Y = monthly bars. Overrides `months`. */
        range: z.enum(SPEND_RANGES).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tzOffset = input.tzOffset ?? 0;
      const now = new Date();
      const granularity = '1m' === input.range ? 'day' : 'month';
      const window =
        'day' === granularity
          ? getDailyWindow(now, tzOffset, RANGE_PERIODS['1m'])
          : getTrendWindow(
              now,
              tzOffset,
              input.range ? RANGE_PERIODS[input.range] : (input.months ?? 6),
            );

      const group = await ctx.db.group.findUnique({
        where: { id: input.groupId },
        select: { budgetAmount: true, budgetCurrency: true, defaultCurrency: true },
      });
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      const rows = await getGroupPeriodSpend(ctx.db, {
        groupId: input.groupId,
        start: window.start,
        end: window.end,
        tzOffset,
        granularity,
      });

      // Same rule as project.summary, so the chart and the gauge use one currency.
      const currency = pickProjectCurrency({
        budgetCurrency: group.budgetCurrency,
        defaultCurrency: group.defaultCurrency,
        expenseCurrencies: currenciesInMonth(
          rows,
          monthKeyOf(window.current.year, window.current.month),
        ),
      });
      const periods: (MonthSlot & { day?: number; total: bigint })[] = periodTotals<
        MonthSlot & { day?: number }
      >(window.slots, rows, currency);
      const otherCurrencies = otherCurrencyTotals(rows, currency);
      const budget =
        group.budgetAmount && 0n < group.budgetAmount && currency === group.budgetCurrency
          ? group.budgetAmount
          : null;

      return {
        currency,
        budget,
        granularity,
        periods,
        /** Kept for older clients: the monthly periods (empty for the daily range). */
        months: 'month' === granularity ? periods : [],
        total: periods.reduce((sum, period) => sum + period.total, 0n),
        average: averagePerPeriod(periods),
        sources: totalsBySource(rows, currency),
        categories: topCategories(rows, currency),
        categoriesBySource: topCategoriesBySource(rows, currency),
        otherCurrencies,
        hasData: hasAnySpend(periods, otherCurrencies),
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
