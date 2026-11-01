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
  /** Set when an agent reported the cost through its API key; such costs count as agent runs. */
  reportedByApiKeyId?: string | null;
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
  reportedByApiKeyId,
}: Pick<BudgetExpense, 'category' | 'isRecurring' | 'reportedByApiKeyId'>): SpendBucket => {
  // Anything an agent reported is an agent run, whatever category it was filed under.
  if (reportedByApiKeyId) {
    return 'agentRuns';
  }
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

/** A straight-line projection needs at least this many days of the month behind it… */
export const MIN_PROJECTION_DAYS = 7;
/** …or at least this share of the month (whichever comes first). */
export const MIN_PROJECTION_SHARE = 0.25;

/**
 * True once enough of the month has passed for a month-end projection to mean something.
 * On day 1 a single $1,346 bill would otherwise "project" to $40,000.
 */
export const hasEnoughPaceData = ({
  dayOfMonth,
  daysInMonth,
}: {
  dayOfMonth: number;
  daysInMonth: number;
}): boolean => {
  if (MIN_PROJECTION_DAYS <= dayOfMonth) {
    return true;
  }
  return 0 < daysInMonth && MIN_PROJECTION_SHARE <= dayOfMonth / daysInMonth;
};

/**
 * On track while the month-end projection at the current pace stays within budget.
 * At risk when the projection exceeds the budget; over once spending has passed it.
 * Early in the month (see hasEnoughPaceData) there is no projection, so it is only
 * "over" or "on track" by what has actually been spent.
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
  if (!hasEnoughPaceData({ dayOfMonth, daysInMonth })) {
    return 'on_track';
  }
  const projected = getMonthEndProjection({ spent, dayOfMonth, daysInMonth });
  return projected > budget ? 'at_risk' : 'on_track';
};

/**
 * What the month will end at if spending keeps its current daily rate
 * (spent ÷ days so far × days in the month). This is the number getBudgetStatus compares
 * with the budget, so the headline and the status always agree.
 */
export const getMonthEndProjection = ({
  spent,
  dayOfMonth,
  daysInMonth,
}: {
  spent: bigint;
  dayOfMonth: number;
  daysInMonth: number;
}): bigint => {
  if (0n >= spent) {
    return 0n;
  }
  const day = Math.min(Math.max(dayOfMonth, 1), Math.max(daysInMonth, 1));
  return BigMath.roundDiv(spent * BigInt(daysInMonth), BigInt(day));
};

/** One consistent headline for a project's month: what to say and the numbers it needs. */
export type PaceSummary =
  | { kind: 'no_budget' }
  /** Too early in the month to project: "Spent $120 so far this month · $1,880 left in budget". */
  | { kind: 'early'; spent: bigint; left: bigint }
  /** Projection stays within budget: "On track · $654 left". */
  | { kind: 'on_track'; left: bigint; projected: bigint }
  /** Projection passes the budget: "On pace to spend $3,280 by 30 Nov, $1,280 over budget". */
  | { kind: 'at_risk'; projected: bigint; overBy: bigint; left: bigint }
  /**
   * Already past the budget: "Over budget by $120 · on pace to spend $2,600 by 30 Nov".
   * `projected` is null while it is too early in the month to project.
   */
  | { kind: 'over'; projected: bigint | null; overBy: bigint };

export const describePace = ({
  budget,
  spent,
  dayOfMonth,
  daysInMonth,
}: {
  budget: bigint | null;
  spent: bigint;
  dayOfMonth: number;
  daysInMonth: number;
}): PaceSummary => {
  const status = getBudgetStatus({ budget, spent, dayOfMonth, daysInMonth });
  if ('no_budget' === status || null === budget) {
    return { kind: 'no_budget' };
  }
  if (!hasEnoughPaceData({ dayOfMonth, daysInMonth })) {
    return spent > budget
      ? { kind: 'over', projected: null, overBy: spent - budget }
      : { kind: 'early', spent, left: budget - spent };
  }
  const projected = getMonthEndProjection({ spent, dayOfMonth, daysInMonth });
  if ('over' === status) {
    return { kind: 'over', projected, overBy: spent - budget };
  }
  if ('at_risk' === status) {
    return { kind: 'at_risk', projected, overBy: projected - budget, left: budget - spent };
  }
  return { kind: 'on_track', left: budget - spent, projected };
};

/** Number of days in a 0-based `month` of `year`. */
export const daysInMonthOf = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * What an even pace would have spent by the end of today (budget × day / days in month).
 * Spending above this is exactly when getBudgetStatus reports "at risk".
 */
export const getPaceAmount = ({
  budget,
  dayOfMonth,
  daysInMonth,
}: {
  budget: bigint;
  dayOfMonth: number;
  daysInMonth: number;
}): bigint => {
  if (0 >= daysInMonth) {
    return budget;
  }
  const day = Math.min(Math.max(dayOfMonth, 1), daysInMonth);
  return BigMath.roundDiv(budget * BigInt(day), BigInt(daysInMonth));
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
