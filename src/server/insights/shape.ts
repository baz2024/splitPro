import { getMonthWindow, percentOf } from '~/server/project/budget';
import { percentChange, usageServiceKey, usageServiceName } from '~/server/subscriptions/helpers';
import { BigMath } from '~/utils/numbers';

/** One calendar month on a chart's time axis (`month` is 0-based, like `Date#getMonth`). */
export interface MonthSlot {
  /** "YYYY-MM", the same shape the database aggregation returns. */
  key: string;
  year: number;
  month: number;
}

/** Who recorded a cost: a person, or a coding agent through its API key. */
export type SpendSource = 'human' | 'agent';

/**
 * A spend aggregate row: one period × currency (× category × source for project rows).
 * `month` is the period key: "YYYY-MM" for monthly rows, "YYYY-MM-DD" for daily rows.
 */
export interface SpendRow {
  month: string;
  currency: string;
  category?: string;
  source?: SpendSource;
  total: bigint;
  /** Number of expenses behind the total; used to pick the main currency. */
  count: number;
}

export interface MonthTotal extends MonthSlot {
  total: bigint;
}

export interface CurrencyTotal {
  currency: string;
  total: bigint;
}

/** A ranked bar: one category or service, or the folded "other" remainder. */
export interface RankedItem {
  key: string;
  total: bigint;
  /** Share of the chart's grand total, 0–100. */
  percent: number;
  isOther: boolean;
}

export const MIN_TREND_MONTHS = 2;
export const MAX_TREND_MONTHS = 12;
export const TOP_ITEMS = 5;
export const OTHER_KEY = 'other';

export const monthKeyOf = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}`;

/**
 * The last `count` months up to and including the viewer's current month, plus the UTC instants
 * that bound them in the viewer's time zone (`tzOffsetMinutes` follows `Date#getTimezoneOffset()`).
 */
export const getTrendWindow = (now: Date, tzOffsetMinutes = 0, count = 6) => {
  const months = Math.min(Math.max(Math.trunc(count), MIN_TREND_MONTHS), MAX_TREND_MONTHS);
  const current = getMonthWindow(now, tzOffsetMinutes);
  const offsetMs = tzOffsetMinutes * 60_000;
  const slots = Array.from({ length: months }, (_, index): MonthSlot => {
    const date = new Date(Date.UTC(current.year, current.month - (months - 1 - index), 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return { key: monthKeyOf(year, month), year, month };
  });

  return {
    slots,
    start: new Date(Date.UTC(current.year, current.month - (months - 1), 1) + offsetMs),
    end: current.end,
    current,
  };
};

const countsByCurrency = (rows: SpendRow[]) =>
  rows.reduce<Map<string, number>>(
    (acc, row) => acc.set(row.currency, (acc.get(row.currency) ?? 0) + row.count),
    new Map(),
  );

/**
 * The currency a personal chart is drawn in: the preferred one when it has any spend, else the
 * currency with the most expenses, else the preferred one (or USD). Amounts are never converted.
 */
export const pickChartCurrency = (rows: SpendRow[], preferred?: string | null): string => {
  const counts = countsByCurrency(rows);
  if (preferred && counts.has(preferred)) {
    return preferred;
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return top?.[0] ?? preferred ?? 'USD';
};

/**
 * Expense currencies of one month, one entry per expense (input for `pickProjectCurrency`).
 * Works for monthly ("YYYY-MM") and daily ("YYYY-MM-DD") rows alike.
 */
export const currenciesInMonth = (rows: SpendRow[], monthKey: string): string[] =>
  rows
    .filter((row) => monthKey === row.month || row.month.startsWith(`${monthKey}-`))
    .flatMap((row) => Array.from({ length: row.count }, () => row.currency));

/** One total per slot in `currency`; periods with no spend are 0 so the axis has no gaps. */
export const periodTotals = <S extends { key: string }>(
  slots: S[],
  rows: SpendRow[],
  currency: string,
): (S & { total: bigint })[] =>
  slots.map((slot) => ({
    ...slot,
    total: rows
      .filter((row) => slot.key === row.month && currency === row.currency)
      .reduce((sum, row) => sum + row.total, 0n),
  }));

export const monthlyTotals = (
  slots: MonthSlot[],
  rows: SpendRow[],
  currency: string,
): MonthTotal[] => periodTotals(slots, rows, currency);

/** One local calendar day on a daily chart (`month` is 0-based). */
export interface DaySlot extends MonthSlot {
  /** "YYYY-MM-DD", the same shape the daily database aggregation returns. */
  key: string;
  day: number;
}

export const dayKeyOf = (year: number, month: number, day: number) =>
  `${monthKeyOf(year, month)}-${String(day).padStart(2, '0')}`;

const DAY_MS = 24 * 60 * 60_000;

/** The last `count` local days up to and including today, and the UTC instants that bound them. */
export const getDailyWindow = (now: Date, tzOffsetMinutes = 0, count = 30) => {
  const days = Math.min(Math.max(Math.trunc(count), 1), 62);
  const current = getMonthWindow(now, tzOffsetMinutes);
  const slots = Array.from({ length: days }, (_, index): DaySlot => {
    const date = new Date(
      Date.UTC(current.year, current.month, current.dayOfMonth - (days - 1 - index)),
    );
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    return { key: dayKeyOf(year, month, day), year, month, day };
  });

  return {
    slots,
    start: new Date(current.todayStart.getTime() - (days - 1) * DAY_MS),
    end: new Date(current.todayStart.getTime() + DAY_MS),
    current,
  };
};

/**
 * Mean spend per period from the first period with any spend to the end of the window, so a
 * project that started two months ago isn't averaged against months before it existed.
 * Null when nothing was spent.
 */
export const averagePerPeriod = (totals: { total: bigint }[]): bigint | null => {
  const firstIndex = totals.findIndex((period) => 0n !== period.total);
  if (-1 === firstIndex) {
    return null;
  }
  const active = totals.slice(firstIndex);
  return BigMath.roundDiv(
    active.reduce((sum, period) => sum + period.total, 0n),
    BigInt(active.length),
  );
};

/** Spend in `currency` split by who recorded it. */
export const totalsBySource = (rows: SpendRow[], currency: string): Record<SpendSource, bigint> =>
  rows
    .filter((row) => currency === row.currency)
    .reduce<Record<SpendSource, bigint>>(
      (acc, row) => {
        acc['agent' === row.source ? 'agent' : 'human'] += row.total;
        return acc;
      },
      { human: 0n, agent: 0n },
    );

/** Top categories overall, for people only and for agents only (rows without a source are human). */
export const topCategoriesBySource = (rows: SpendRow[], currency: string) => ({
  all: topCategories(rows, currency),
  human: topCategories(
    rows.filter((row) => 'agent' !== row.source),
    currency,
  ),
  agent: topCategories(
    rows.filter((row) => 'agent' === row.source),
    currency,
  ),
});

/** Totals for every currency except the charted one, largest first; zero totals dropped. */
export const otherCurrencyTotals = (rows: SpendRow[], currency: string): CurrencyTotal[] => {
  const totals = rows
    .filter((row) => currency !== row.currency)
    .reduce<
      Map<string, bigint>
    >((acc, row) => acc.set(row.currency, (acc.get(row.currency) ?? 0n) + row.total), new Map());
  return [...totals.entries()]
    .filter(([, total]) => 0n !== total)
    .map(([code, total]) => ({ currency: code, total }))
    .sort((a, b) =>
      a.total === b.total ? a.currency.localeCompare(b.currency) : a.total > b.total ? -1 : 1,
    );
};

/**
 * Ranks positive totals largest first, keeps the top `limit` and folds the rest into one "other"
 * item, so a chart never needs more than `limit + 1` bars.
 */
export const rankWithOther = (
  totals: Map<string, bigint>,
  limit = TOP_ITEMS,
  otherKey = OTHER_KEY,
): RankedItem[] => {
  const positive = [...totals.entries()]
    .filter(([, total]) => 0n < total)
    .sort(([keyA, a], [keyB, b]) => (a === b ? keyA.localeCompare(keyB) : a > b ? -1 : 1));
  const grand = positive.reduce((sum, [, total]) => sum + total, 0n);
  // Folding a single leftover into "other" would hide its name for no space saved.
  const keep = positive.length === limit + 1 ? positive : positive.slice(0, limit);
  const rest = positive.slice(keep.length).reduce((sum, [, total]) => sum + total, 0n);

  const items = keep.map(([key, total]) => ({
    key,
    total,
    percent: percentOf(total, grand),
    isOther: false,
  }));
  return 0n < rest
    ? [...items, { key: otherKey, total: rest, percent: percentOf(rest, grand), isOther: true }]
    : items;
};

/** Spend per category in `currency` across all rows: top five plus "other". */
export const topCategories = (
  rows: SpendRow[],
  currency: string,
  limit = TOP_ITEMS,
): RankedItem[] =>
  rankWithOther(
    rows
      .filter((row) => currency === row.currency)
      .reduce<Map<string, bigint>>((acc, row) => {
        const category = row.category ?? OTHER_KEY;
        return acc.set(category, (acc.get(category) ?? 0n) + row.total);
      }, new Map()),
    limit,
    // A real "other" category never collides with the folded remainder.
    '__other__',
  );

export interface ServiceCostInput {
  description: string;
  currency: string;
  monthlyAmount: bigint;
}

export interface ServiceCost extends RankedItem {
  /** Display name: the service catalog name when known, else the base expense name. */
  label: string;
  /** Subscriptions behind this bar (several plans of one service share a bar). */
  count: number;
}

/** Monthly cost per service in `currency`: top services plus a folded "other" bar. */
export const monthlyCostByService = (
  items: ServiceCostInput[],
  currency: string,
  limit = TOP_ITEMS,
): ServiceCost[] => {
  const matching = items.filter((item) => currency === item.currency);
  const byKey = matching.reduce<Map<string, { label: string; total: bigint; count: number }>>(
    (acc, item) => {
      const key = usageServiceKey(item.description);
      const current = acc.get(key) ?? {
        label: usageServiceName(item.description),
        total: 0n,
        count: 0,
      };
      return acc.set(key, {
        ...current,
        total: current.total + item.monthlyAmount,
        count: current.count + 1,
      });
    },
    new Map(),
  );
  const ranked = rankWithOther(
    new Map([...byKey.entries()].map(([key, { total }]) => [key, total])),
    limit,
    '__other__',
  );
  const keptCount = ranked
    .filter((item) => !item.isOther)
    .reduce((sum, item) => sum + (byKey.get(item.key)?.count ?? 0), 0);

  return ranked.map((item) =>
    Object.assign(item, {
      label: item.isOther ? '' : (byKey.get(item.key)?.label ?? item.key),
      count: item.isOther ? matching.length - keptCount : (byKey.get(item.key)?.count ?? 0),
    }),
  );
};

export interface MonthComparison {
  current: bigint;
  /** Mean of the earlier months that had any spend; null when none did. */
  average: bigint | null;
  /** Whole-percent change of `current` against `average`; null without an average. */
  changePercent: number | null;
}

/** The last month against the average of the months before it (zero months are skipped). */
export const compareToAverage = (months: MonthTotal[]): MonthComparison => {
  const current = months.at(-1)?.total ?? 0n;
  const earlier = months.slice(0, -1).filter((month) => 0n < month.total);
  if (0 === earlier.length) {
    return { current, average: null, changePercent: null };
  }
  const average = BigMath.roundDiv(
    earlier.reduce((sum, month) => sum + month.total, 0n),
    BigInt(earlier.length),
  );
  return { current, average, changePercent: percentChange(current, average) };
};

/** True when there is nothing to chart in any currency. */
export const hasAnySpend = (months: MonthTotal[], others: CurrencyTotal[]) =>
  months.some((month) => 0n !== month.total) || 0 < others.length;
