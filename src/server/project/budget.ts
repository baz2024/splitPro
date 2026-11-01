import cronParser from 'cron-parser';

import { BigMath } from '~/utils/numbers';

/** Categories that count as metered API / infrastructure usage when they are not recurring. */
export const API_USAGE_CATEGORIES = [
  'aiApis',
  'cloudHosting',
  'databases',
  'messagingApis',
  'monitoring',
] as const;

/** Categories that count as coding-agent runs. */
export const AGENT_RUN_CATEGORIES = ['codingAgents'] as const;

export const SPEND_BUCKETS = ['subscriptions', 'apiUsage', 'agentRuns', 'other'] as const;
export type SpendBucket = (typeof SPEND_BUCKETS)[number];

export type BudgetStatus = 'no_budget' | 'on_track' | 'at_risk' | 'over';

export interface BudgetExpense {
  amount: bigint;
  currency: string;
  category: string;
  isRecurring: boolean;
}

export interface MonthWindow {
  /** UTC instant of local midnight on the 1st of the month. */
  start: Date;
  /** UTC instant of local midnight on the 1st of the next month (exclusive). */
  end: Date;
  /** UTC instant of local midnight today. */
  todayStart: Date;
  year: number;
  /** 0-based month index. */
  month: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** Whole days remaining after today (Nov 1 in a 30-day month → 29). */
  daysLeft: number;
}

const MINUTE_MS = 60_000;

/**
 * Month boundaries in the viewer's local time.
 * `tzOffsetMinutes` follows `Date#getTimezoneOffset()` (positive west of UTC).
 */
export const getMonthWindow = (now: Date, tzOffsetMinutes = 0): MonthWindow => {
  const offsetMs = tzOffsetMinutes * MINUTE_MS;
  const local = new Date(now.getTime() - offsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const dayOfMonth = local.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return {
    start: new Date(Date.UTC(year, month, 1) + offsetMs),
    end: new Date(Date.UTC(year, month + 1, 1) + offsetMs),
    todayStart: new Date(Date.UTC(year, month, dayOfMonth) + offsetMs),
    year,
    month,
    dayOfMonth,
    daysInMonth,
    daysLeft: daysInMonth - dayOfMonth,
  };
};

export const bucketFor = ({
  category,
  isRecurring,
}: Pick<BudgetExpense, 'category' | 'isRecurring'>): SpendBucket => {
  if (isRecurring) {
    return 'subscriptions';
  }
  if ((AGENT_RUN_CATEGORIES as readonly string[]).includes(category)) {
    return 'agentRuns';
  }
  if ((API_USAGE_CATEGORIES as readonly string[]).includes(category)) {
    return 'apiUsage';
  }
  return 'other';
};

export interface SpendSummary {
  spent: bigint;
  buckets: Record<SpendBucket, bigint>;
  /** True when at least one expense was ignored because it is in another currency. */
  skippedOtherCurrencies: boolean;
}

/** Totals expenses in `currency` only; other currencies are skipped (never converted). */
export const summarizeSpend = (expenses: BudgetExpense[], currency: string): SpendSummary =>
  expenses.reduce<SpendSummary>(
    (acc, expense) => {
      if (currency !== expense.currency) {
        acc.skippedOtherCurrencies = true;
        return acc;
      }
      const bucket = bucketFor(expense);
      acc.spent += expense.amount;
      acc.buckets[bucket] += expense.amount;
      return acc;
    },
    {
      spent: 0n,
      buckets: { subscriptions: 0n, apiUsage: 0n, agentRuns: 0n, other: 0n },
      skippedOtherCurrencies: false,
    },
  );

/**
 * On track while the month-end projection at the current pace stays within budget.
 * At risk when the projection exceeds the budget; over once spending has passed it.
 */
export const getBudgetStatus = ({
  budget,
  spent,
  dayOfMonth,
  daysInMonth,
}: {
  budget: bigint | null;
  spent: bigint;
  dayOfMonth: number;
  daysInMonth: number;
}): BudgetStatus => {
  if (null === budget || 0n >= budget) {
    return 'no_budget';
  }
  if (spent > budget) {
    return 'over';
  }
  const projected = BigMath.roundDiv(spent * BigInt(daysInMonth), BigInt(Math.max(dayOfMonth, 1)));
  return projected > budget ? 'at_risk' : 'on_track';
};

/** What is left can be spent evenly across today plus the remaining days. */
export const getSafeToSpendPerDay = (left: bigint, daysLeft: number): bigint => {
  if (0n >= left) {
    return 0n;
  }
  return left / BigInt(daysLeft + 1);
};

/** Share of `value` in `total`, as a 0–100 number for progress bars. */
export const percentOf = (value: bigint, total: bigint): number => {
  if (0n >= total || 0n >= value) {
    return 0;
  }
  if (value >= total) {
    return 100;
  }
  return Number((value * 10_000n) / total) / 100;
};

/**
 * Next run of a pg_cron schedule (stored in UTC, with `$` meaning "last day of month"),
 * or null when it cannot be parsed.
 */
export const getNextRun = (schedule: string, now: Date): Date | null => {
  try {
    return cronParser
      .parseExpression(schedule.replaceAll('$', 'L'), { currentDate: now, tz: 'UTC' })
      .next()
      .toDate();
  } catch {
    return null;
  }
};

export const isDueWithin = (schedule: string, now: Date, days: number): boolean => {
  const next = getNextRun(schedule, now);
  if (!next) {
    return false;
  }
  return next.getTime() - now.getTime() <= days * 24 * 60 * MINUTE_MS;
};

/**
 * Picks the currency the project is tracked in: the budget's, else the group default,
 * else the most used currency this month, else USD.
 */
export const pickProjectCurrency = ({
  budgetCurrency,
  defaultCurrency,
  expenseCurrencies,
}: {
  budgetCurrency: string | null;
  defaultCurrency: string | null;
  expenseCurrencies: string[];
}): string => {
  if (budgetCurrency) {
    return budgetCurrency;
  }
  if (defaultCurrency) {
    return defaultCurrency;
  }
  const counts = expenseCurrencies.reduce<Map<string, number>>(
    (acc, code) => acc.set(code, (acc.get(code) ?? 0) + 1),
    new Map(),
  );
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return top?.[0] ?? 'USD';
};

/** Parses a plain decimal string ("2000", "19.99") into minor units for the given precision. */
export const parseDecimalToMinor = (value: string, decimalDigits: number): bigint | null => {
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, whole = '0', fraction = ''] = match;
  if (fraction.length > decimalDigits) {
    return null;
  }
  const scale = 10n ** BigInt(decimalDigits);
  return BigInt(whole) * scale + BigInt(fraction.padEnd(decimalDigits, '0') || '0');
};
