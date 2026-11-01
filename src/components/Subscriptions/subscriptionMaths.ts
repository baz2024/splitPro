/** Client-side maths for the Subscriptions header. All amounts are BigInt minor units. */

interface CostItem {
  currency: string;
  yearlyAmount: bigint;
  remainingThisMonth: bigint;
  unused: boolean;
  nextDueDate: Date | null;
}

/** Yearly cost of every subscription billed in `currency`. */
export const yearlyTotal = (items: readonly CostItem[], currency: string): bigint =>
  items
    .filter((item) => item.currency === currency)
    .reduce((sum, item) => sum + item.yearlyAmount, 0n);

export interface UnusedSavings {
  /** Unused subscriptions billed in `currency`. */
  count: number;
  /** What cancelling them saves over a year. */
  yearly: bigint;
}

/** "Cancel 2 unused services, save $480 a year": unused 30+ days, in `currency`. */
export const unusedSavings = (items: readonly CostItem[], currency: string): UnusedSavings => {
  const unused = items.filter((item) => item.unused && item.currency === currency);
  return {
    count: unused.length,
    yearly: unused.reduce((sum, item) => sum + item.yearlyAmount, 0n),
  };
};

export interface MonthCashItem extends CostItem {
  /** One charge, in minor units. */
  amount: bigint;
  cadence: 'weekly' | 'monthly' | 'yearly' | 'other';
}

export interface MonthCashSummary {
  /** Charges that fell due this UTC month before `now`. */
  paid: bigint;
  /** Charges still due between `now` and the end of this UTC month. */
  remaining: bigint;
  /** Everything due this UTC month: always `paid + remaining`. */
  total: bigint;
  /** The soonest charge still due this month, or null when nothing is left. */
  nextCharge: Date | null;
}

/** Weekly plans charge at most five times a month; stop walking back well after that. */
const MAX_CHARGES_PER_MONTH = 6;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Same day and time `months` earlier, or null when that month has no such day (cron skips it). */
const monthsEarlier = (date: Date, months: number): Date | null => {
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() - months);
  const target = shifted.getUTCMonth();
  shifted.setUTCDate(date.getUTCDate());
  return shifted.getUTCMonth() === target ? shifted : null;
};

/** The charge before `date` on this cadence, or null when it can't be worked out. */
export const previousCharge = (date: Date, cadence: MonthCashItem['cadence']): Date | null => {
  if ('weekly' === cadence) {
    return new Date(date.getTime() - WEEK_MS);
  }
  if ('yearly' === cadence) {
    return monthsEarlier(date, 12);
  }
  if ('monthly' !== cadence) {
    return null;
  }
  // A day-31 plan skips 30-day months, as its cron does.
  return monthsEarlier(date, 1) ?? monthsEarlier(date, 2);
};

const countChargesBack = (
  from: Date,
  cadence: MonthCashItem['cadence'],
  start: Date,
  now: Date,
  count = 0,
): number => {
  const prev = previousCharge(from, cadence);
  if (
    !prev ||
    MAX_CHARGES_PER_MONTH <= count ||
    prev.getTime() < start.getTime() ||
    prev.getTime() >= now.getTime()
  ) {
    return count;
  }
  return countChargesBack(prev, cadence, start, now, count + 1);
};

/**
 * What one subscription charged between the start of this UTC month and `now`, worked back from
 * its next due date. A yearly plan only counts in the month it renews.
 */
export const chargedSoFarThisMonth = (item: MonthCashItem, now: Date): bigint => {
  if (!item.nextDueDate) {
    return 0n;
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return item.amount * BigInt(countChargesBack(item.nextDueDate, item.cadence, start, now));
};

/**
 * This month's cash in one currency, on one basis: each charge scheduled this UTC month is
 * either paid (before `now`) or still to pay, never both, so paid + remaining is the month's
 * total. The run-rate is a monthly average and can differ (yearly plans spread over 12 months).
 */
export const monthCash = (
  items: readonly MonthCashItem[],
  currency: string,
  now: Date,
): MonthCashSummary => {
  const inCurrency = items.filter((item) => item.currency === currency);
  const dueItems = inCurrency.filter((item) => 0n < item.remainingThisMonth);
  const nextCharge = dueItems.reduce<Date | null>((soonest, item) => {
    if (!item.nextDueDate) {
      return soonest;
    }
    return null === soonest || item.nextDueDate.getTime() < soonest.getTime()
      ? item.nextDueDate
      : soonest;
  }, null);
  const paid = inCurrency.reduce((sum, item) => sum + chargedSoFarThisMonth(item, now), 0n);
  const remaining = dueItems.reduce((sum, item) => sum + item.remainingThisMonth, 0n);
  return { paid, remaining, total: paid + remaining, nextCharge };
};
