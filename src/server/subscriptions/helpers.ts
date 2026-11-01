import cronParser from 'cron-parser';

import { findService } from '~/lib/serviceCatalog';
import { BigMath } from '~/utils/numbers';

export type SubscriptionCadence = 'weekly' | 'monthly' | 'yearly' | 'other';

/** Categories whose non-recurring expenses count as metered (usage-based) spend. */
export const USAGE_CATEGORIES = [
  'aiApis',
  'cloudHosting',
  'databases',
  'messagingApis',
  'monitoring',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES_PER_YEAR = 400;

/** Postgres cron stores `L` (last day of month) as `$`; cron-parser wants `L`. */
export const normaliseBackendCron = (schedule: string) => schedule.trim().replaceAll('$', 'L');

const isWildcard = (field: string | undefined) => '*' === field || '?' === field;
const isSingleValue = (field: string | undefined) => undefined !== field && /^(\d+|L)$/.test(field);

/** Classify a 5-field cron expression (as stored by pg_cron) into a billing cadence. */
export const cadenceFromCron = (schedule: string): SubscriptionCadence => {
  const fields = normaliseBackendCron(schedule).split(/\s+/);
  if (5 !== fields.length) {
    return 'other';
  }
  const [, , dayOfMonth, month, dayOfWeek] = fields;

  if (isWildcard(dayOfMonth) && isWildcard(month) && isSingleValue(dayOfWeek)) {
    return 'weekly';
  }
  if (isSingleValue(dayOfMonth) && isWildcard(month) && isWildcard(dayOfWeek)) {
    return 'monthly';
  }
  if (isSingleValue(dayOfMonth) && isSingleValue(month) && isWildcard(dayOfWeek)) {
    return 'yearly';
  }
  return 'other';
};

/** Next run of the backend (UTC) cron after `from`, or null if it cannot be parsed. */
export const nextRunDate = (schedule: string, from: Date): Date | null => {
  try {
    return cronParser
      .parseExpression(normaliseBackendCron(schedule), { currentDate: from, tz: 'UTC' })
      .next()
      .toDate();
  } catch {
    return null;
  }
};

/** How many times the cron fires in the 365 days after `from`. */
export const occurrencesPerYear = (schedule: string, from: Date): number => {
  try {
    const interval = cronParser.parseExpression(normaliseBackendCron(schedule), {
      currentDate: from,
      endDate: new Date(from.getTime() + 365 * DAY_MS),
      tz: 'UTC',
    });
    let count = 0;
    while (interval.hasNext() && count < MAX_OCCURRENCES_PER_YEAR) {
      interval.next();
      count += 1;
    }
    return count;
  } catch {
    return 0;
  }
};

/**
 * Monthly cost of one recurring charge in minor units.
 * yearly → amount / 12, weekly → amount × 52 / 12, other crons → yearly occurrences × amount / 12.
 */
export const monthlyAmount = (
  amount: bigint,
  cadence: SubscriptionCadence,
  schedule: string,
  from: Date,
): bigint => {
  if ('monthly' === cadence) {
    return amount;
  }
  if ('yearly' === cadence) {
    return BigMath.roundDiv(amount, 12n);
  }
  if ('weekly' === cadence) {
    return BigMath.roundDiv(amount * 52n, 12n);
  }
  return BigMath.roundDiv(amount * BigInt(occurrencesPerYear(schedule, from)), 12n);
};

/** Whole days from `from` to `to`, counted on UTC calendar days (0 = today, 1 = tomorrow). */
export const daysUntil = (to: Date, from: Date): number => {
  const startOfDay = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
};

export interface RunRate {
  currency: string;
  monthly: bigint;
  count: number;
}

/**
 * Sum monthly amounts per currency. The primary currency (most subscriptions; ties go to the
 * user's preferred currency, then the larger total) comes first.
 */
export const summariseRunRates = (
  items: { currency: string; monthlyAmount: bigint }[],
  preferredCurrency?: string | null,
): RunRate[] => {
  const byCurrency = items.reduce<Map<string, RunRate>>((acc, item) => {
    const current = acc.get(item.currency) ?? { currency: item.currency, monthly: 0n, count: 0 };
    acc.set(item.currency, {
      currency: item.currency,
      monthly: current.monthly + item.monthlyAmount,
      count: current.count + 1,
    });
    return acc;
  }, new Map());

  return [...byCurrency.values()].sort((a, b) => {
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    if (preferredCurrency === a.currency) {
      return -1;
    }
    if (preferredCurrency === b.currency) {
      return 1;
    }
    if (a.monthly === b.monthly) {
      return a.currency.localeCompare(b.currency);
    }
    return a.monthly > b.monthly ? -1 : 1;
  });
};

/** Percent change from `previous` to `current`, rounded; null when there is nothing to compare. */
export const percentChange = (current: bigint, previous: bigint): number | null => {
  if (0n >= previous) {
    return null;
  }
  return Number(BigMath.roundDiv((current - previous) * 100n, previous));
};

/** Group key for usage rows: catalog id when the service is known, else the trimmed name. */
export const usageServiceKey = (name: string): string =>
  findService(name)?.id ?? name.trim().toLowerCase().replace(/\s+/g, ' ');

export interface UsageExpenseInput {
  id: string;
  groupId: number | null;
  name: string;
  amount: bigint;
  currency: string;
  category: string;
  expenseDate: Date;
}

export interface UsageSummary {
  key: string;
  name: string;
  category: string;
  currency: string;
  thisMonth: bigint;
  lastMonth: bigint;
  changePercent: number | null;
  lastExpenseDate: Date;
  /** Newest expense in the group, so the row can open it. */
  lastExpenseId: string;
  lastExpenseGroupId: number | null;
}

/** UTC start of the month that contains `date`, shifted by `offset` months. */
export const monthStart = (date: Date, offset = 0): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

/**
 * Group this month's and last month's usage expenses by service + currency. Only services with
 * spend this month are returned, largest first.
 */
export const summariseUsage = (expenses: UsageExpenseInput[], now: Date): UsageSummary[] => {
  const thisMonthStart = monthStart(now).getTime();
  const lastMonthStart = monthStart(now, -1).getTime();
  const nextMonthStart = monthStart(now, 1).getTime();

  const grouped = expenses
    .filter((expense) => (USAGE_CATEGORIES as readonly string[]).includes(expense.category))
    .reduce<Map<string, UsageSummary>>((acc, expense) => {
      const time = expense.expenseDate.getTime();
      if (time < lastMonthStart || time >= nextMonthStart) {
        return acc;
      }
      const key = `${usageServiceKey(expense.name)}|${expense.currency}`;
      const isThisMonth = time >= thisMonthStart;
      const current = acc.get(key) ?? {
        key,
        name: expense.name.trim(),
        category: expense.category,
        currency: expense.currency,
        thisMonth: 0n,
        lastMonth: 0n,
        changePercent: null,
        lastExpenseDate: expense.expenseDate,
        lastExpenseId: expense.id,
        lastExpenseGroupId: expense.groupId,
      };
      const isNewest = time >= current.lastExpenseDate.getTime();
      acc.set(key, {
        ...current,
        name: isNewest ? expense.name.trim() : current.name,
        category: isNewest ? expense.category : current.category,
        lastExpenseDate: isNewest ? expense.expenseDate : current.lastExpenseDate,
        lastExpenseId: isNewest ? expense.id : current.lastExpenseId,
        lastExpenseGroupId: isNewest ? expense.groupId : current.lastExpenseGroupId,
        thisMonth: current.thisMonth + (isThisMonth ? expense.amount : 0n),
        lastMonth: current.lastMonth + (isThisMonth ? 0n : expense.amount),
      });
      return acc;
    }, new Map());

  return [...grouped.values()]
    .filter((usage) => 0n < usage.thisMonth)
    .map((usage) =>
      Object.assign(usage, { changePercent: percentChange(usage.thisMonth, usage.lastMonth) }),
    )
    .sort((a, b) => (a.thisMonth === b.thisMonth ? 0 : a.thisMonth > b.thisMonth ? -1 : 1));
};

export type SplitKind = { kind: 'personal' } | { kind: 'split'; ways: number };

/**
 * Personal when no balance moves between people (one participant, or every amount is zero),
 * otherwise split between everyone with a non-zero balance entry.
 */
export const splitKindFromParticipants = (
  participants: { userId: number; amount: bigint }[],
): SplitKind => {
  const ways = new Set(
    participants
      .filter((participant) => 0n !== participant.amount)
      .map((participant) => participant.userId),
  ).size;
  if (1 >= ways) {
    return { kind: 'personal' };
  }
  return { kind: 'split', ways };
};
