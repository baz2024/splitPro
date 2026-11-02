import type { CalendarDate } from '../dataio/dates';
import type { ScanCadence } from './types';

/** Number of days in a calendar month (1-12). */
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const isLastDayOfMonth = ({ year, month, day }: CalendarDate) => day === daysInMonth(year, month);

/**
 * The date one billing cycle before `date`. A trial has no real charge yet, but the recurring job
 * needs an expense to copy. Dating that placeholder a cycle before the first real charge keeps it
 * out of the month the real charge lands in, so that month isn't counted twice.
 */
export const previousCycleDate = (
  { year, month, day }: CalendarDate,
  cadence: ScanCadence,
): Date => {
  if ('weekly' === cadence) {
    return new Date(Date.UTC(year, month - 1, day - 7, 12));
  }
  const target = new Date(Date.UTC(year, month - 1 - ('yearly' === cadence ? 12 : 1), 1));
  const lastDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay), 12),
  );
};

/**
 * Backend (UTC, pg_cron) schedule for a subscription that next renews on `nextRenewal`.
 * Runs at 00:00 UTC on the renewal day, so the next run of the job is `nextRenewal` itself.
 *
 * - monthly: `0 0 <day> * *`; day 29-31 that is the month's last day uses pg_cron's `$`
 *   (last day of month, what `cronToBackend` stores for `L`) so short months still charge.
 * - yearly: `0 0 <day> <month> *`; Feb 29 becomes the last day of February.
 * - weekly: `0 0 * * <day of week>` (0 = Sunday).
 */
export const cadenceCron = (cadence: ScanCadence, nextRenewal: CalendarDate): string => {
  const { year, month, day } = nextRenewal;
  if ('weekly' === cadence) {
    return `0 0 * * ${new Date(Date.UTC(year, month - 1, day)).getUTCDay()}`;
  }
  if ('yearly' === cadence) {
    const yearlyDay = 2 === month && 29 === day ? '$' : String(day);
    return `0 0 ${yearlyDay} ${month} *`;
  }
  const monthlyDay = 28 < day && isLastDayOfMonth(nextRenewal) ? '$' : String(day);
  return `0 0 ${monthlyDay} * *`;
};
