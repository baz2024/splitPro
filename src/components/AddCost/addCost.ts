import { CATEGORIES, type CategoryItem } from '~/lib/category';
import { SERVICE_CATALOG, type ServiceInfo, findService } from '~/lib/serviceCatalog';

export const COST_TYPES = ['subscription', 'usage', 'oneoff'] as const;
export type CostType = (typeof COST_TYPES)[number];

export type BillingCadence = 'monthly' | 'yearly';

/** Category keys offered for a service that is not in the catalog ("Other"). */
export const TECH_CATEGORY_OPTIONS: readonly CategoryItem[] = CATEGORIES.tech.map((item) =>
  'other' === item ? 'tech' : item,
);

/** Services billed by usage, shown on the API usage tab. */
export const USAGE_SERVICES: readonly ServiceInfo[] = SERVICE_CATALOG.filter(
  (service: ServiceInfo) => 'usage' === service.billing,
);

const firstQueryValue = (value: unknown): string | undefined => {
  if ('string' === typeof value) {
    return value;
  }
  if (Array.isArray(value) && 'string' === typeof value[0]) {
    return value[0];
  }
  return undefined;
};

/**
 * Which tab /add opens on. `?type=subscription|usage` picks those tabs; everything else
 * (including the existing `?mode=scan|manual` links) opens the one-off journey.
 */
export const parseCostType = (query: Record<string, unknown>): CostType => {
  const type = firstQueryValue(query.type);
  if ('subscription' === type || 'usage' === type) {
    return type;
  }
  return 'oneoff';
};

/** Optional `?service=<id or name>` preselection; only honoured for catalog services. */
export const parseServiceQuery = (query: Record<string, unknown>): ServiceInfo | undefined =>
  findService(firstQueryValue(query.service));

export const parseCadence = (value: unknown): BillingCadence =>
  'yearly' === value ? 'yearly' : 'monthly';

/** "Vercel Pro", or just "Vercel" when no plan is given. */
export const buildSubscriptionDescription = (serviceName: string, plan: string): string =>
  [serviceName.trim(), plan.trim()].filter((part) => '' !== part).join(' ');

/** "Anthropic API · Nov 2026". Uses Latin digits so descriptions stay searchable. */
export const buildUsageDescription = (serviceName: string, month: Date, locale = 'en'): string => {
  const label = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    month: 'short',
    year: 'numeric',
  }).format(month);
  return `${serviceName.trim()} API · ${label}`;
};

const daysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

/** Adds whole months, clamping the day so 31 Jan + 1 month is 28/29 Feb. */
export const addMonthsClamped = (date: Date, months: number): Date => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, date.getHours());
  const day = Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  target.setDate(day);
  return target;
};

const cadenceMonths = (cadence: BillingCadence) => ('yearly' === cadence ? 12 : 1);

/** One billing period after today: the default "Next renewal". */
export const defaultNextRenewal = (cadence: BillingCadence, today: Date = new Date()): Date =>
  addMonthsClamped(today, cadenceMonths(cadence));

/**
 * Date for the saved expense: the charge one period before the next renewal, never in the
 * future. The recurring job then repeats it on each renewal date.
 */
export const lastChargeDate = (
  cadence: BillingCadence,
  nextRenewal: Date,
  today: Date = new Date(),
): Date => {
  const previous = addMonthsClamped(nextRenewal, -cadenceMonths(cadence));
  return previous.getTime() > today.getTime() ? today : previous;
};

/**
 * Local-time cron expression (as the cron builder produces it) that fires at midnight on the
 * renewal day each month or year. Day 31, and 29 Feb for yearly plans, map to the last day of
 * the month so short months are not skipped. Convert with cronToBackend before saving.
 */
export const cadenceToCron = (cadence: BillingCadence, nextRenewal: Date): string => {
  const day = nextRenewal.getDate();
  const month = nextRenewal.getMonth() + 1;

  if ('monthly' === cadence) {
    return `0 0 ${31 === day ? 'L' : day} * *`;
  }
  const isLeapDay = 2 === month && 29 === day;
  return `0 0 ${isLeapDay ? 'L' : day} ${month} *`;
};

/** `YYYY-MM` for an <input type="month">. */
export const toMonthInputValue = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** Parses `YYYY-MM`; returns the first day of that month, or undefined. */
export const fromMonthInputValue = (value: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const monthIndex = Number(match[2]) - 1;
  if (0 > monthIndex || 11 < monthIndex) {
    return undefined;
  }
  return new Date(Number(match[1]), monthIndex, 1);
};

/** Date for a usage bill: today for the current month, otherwise that month's last day. */
export const usageExpenseDate = (month: Date, today: Date = new Date()): Date => {
  const lastDay = new Date(
    month.getFullYear(),
    month.getMonth(),
    daysInMonth(month.getFullYear(), month.getMonth()),
    12,
  );
  return lastDay.getTime() > today.getTime() ? today : lastDay;
};
