import { formatMoneyParts, moneyToString } from '~/components/Safi/Money';
import { type CalendarDate } from '~/server/dataio/dates';
import { type ScanDecision } from '~/server/statementScan/types';

import { type ConfirmDecision, type ScanDraft, type ScanListItem } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days at or under which a renewal reads "Renews in 3 days" instead of a date. */
export const SOON_DAYS = 14;

const toIntlLocale = (locale?: string) => (!locale || 'default' === locale ? 'en' : locale);

/** A count in the locale's digits ("٧" in Arabic). */
export const formatCount = (count: number, locale: string) =>
  new Intl.NumberFormat(toIntlLocale(locale)).format(count);

const calendarToUtc = ({ year, month, day }: CalendarDate) => Date.UTC(year, month - 1, day);

/** "Today" as a calendar date in the browser's own time zone. */
export const todayCalendar = (now: Date = new Date()): CalendarDate => ({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  day: now.getDate(),
});

export const daysBetween = (from: CalendarDate, to: CalendarDate) =>
  Math.round((calendarToUtc(to) - calendarToUtc(from)) / DAY_MS);

const formatCalendar = (date: CalendarDate, locale: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(toIntlLocale(locale), { ...options, timeZone: 'UTC' }).format(
    new Date(calendarToUtc(date)),
  );

/** "12 Dec", plus the year when it isn't the current one ("3 Jan 2027"). */
export const formatDay = (date: CalendarDate, locale: string, today?: CalendarDate) =>
  formatCalendar(date, locale, {
    day: 'numeric',
    month: 'short',
    ...(today && today.year !== date.year ? { year: 'numeric' } : {}),
  });

/** "Mar 2025". */
export const formatMonthYear = (date: CalendarDate, locale: string) =>
  formatCalendar(date, locale, { month: 'short', year: 'numeric' });

/** "Jan – Nov 2026", or "Nov 2025 – Feb 2026" across years. */
export const formatRange = (from: CalendarDate, to: CalendarDate, locale: string) => {
  if (from.year === to.year && from.month === to.month) {
    return formatMonthYear(to, locale);
  }
  const start =
    from.year === to.year
      ? formatCalendar(from, locale, { month: 'short' })
      : formatMonthYear(from, locale);
  return `${start} – ${formatMonthYear(to, locale)}`;
};

/** Money as plain text for use inside sentences. `whole` drops ".00" on round amounts. */
export const moneyText = ({
  amount,
  currency,
  locale,
  whole = false,
}: {
  amount: bigint;
  currency: string;
  locale: string;
  whole?: boolean;
}) => {
  const parts = formatMoneyParts({ amount, currency, locale });
  const roundAmount = parts
    .filter((part) => 'cents' === part.type)
    .every((part) => /^[0٠۰]*$/.test(part.value));
  if (!whole || !roundAmount) {
    return moneyToString(parts);
  }
  return moneyToString(parts.filter((part) => 'decimal' !== part.type && 'cents' !== part.type));
};

const RESELLER_NAMES: Record<string, string> = {
  paddle: 'Paddle',
  stripe: 'Stripe',
  google: 'Google Play',
  apple: 'Apple',
  paypal: 'PayPal',
  fastspring: 'FastSpring',
  gumroad: 'Gumroad',
  lemonsqueezy: 'Lemon Squeezy',
};

/** Display name for the reseller a charge came through ("paddle" → "Paddle"). */
export const resellerName = (via: string) =>
  RESELLER_NAMES[via.toLowerCase()] ?? `${via.charAt(0).toUpperCase()}${via.slice(1)}`;

/**
 * What to draw the badge from. The vendor's display name, not its catalog id, so a row looks the
 * same here as on the subscriptions page; a note in brackets would end up in the initials.
 */
export const badgeService = (item: Pick<ScanListItem, 'vendor'>) =>
  item.vendor.name.replace(/\s*\(.*$/, '') || item.vendor.name;

const PRICED_DECISIONS: ReadonlySet<ScanDecision> = new Set(['using', 'not_sure', 'cancel']);

export const effectiveAmount = (item: ScanListItem, draft: ScanDraft | undefined) =>
  draft?.amountMinor ?? item.amountMinor;

/** Saving a subscription needs a price; trials often arrive without one. */
export const needsAmount = (item: ScanListItem, draft: ScanDraft | undefined) => {
  const decision = draft?.decision;
  if (!decision) {
    return false;
  }
  return PRICED_DECISIONS.has(decision) && 0n >= effectiveAmount(item, draft);
};

/** Flagged items first (most money at risk first), then the rest by yearly cost. */
export const sortForReview = (items: readonly ScanListItem[]) =>
  [...items].sort((a, b) => {
    const flagged = Number(0 < b.flags.length) - Number(0 < a.flags.length);
    if (0 !== flagged) {
      return flagged;
    }
    if (a.atRiskYearlyMinor !== b.atRiskYearlyMinor) {
      return a.atRiskYearlyMinor < b.atRiskYearlyMinor ? 1 : -1;
    }
    if (a.yearlyMinor !== b.yearlyMinor) {
      return a.yearlyMinor < b.yearlyMinor ? 1 : -1;
    }
    return a.vendor.name.localeCompare(b.vendor.name);
  });

/** Decided items as the `confirm` mutation expects them, sending only real corrections. */
export const buildDecisions = (
  items: readonly ScanListItem[],
  drafts: Readonly<Record<string, ScanDraft>>,
): ConfirmDecision[] =>
  items.flatMap((item) => {
    const draft = drafts[item.id];
    if (!draft?.decision) {
      return [];
    }
    const name = draft.name?.trim();
    return [
      {
        id: item.id,
        decision: draft.decision,
        ...(undefined !== draft.amountMinor && draft.amountMinor !== item.amountMinor
          ? { amountMinor: draft.amountMinor }
          : {}),
        ...(draft.cadence && draft.cadence !== item.cadence ? { cadence: draft.cadence } : {}),
        ...(name && name !== item.vendor.name ? { name } : {}),
      },
    ];
  });

/** Display name for an item, preferring the user's correction. */
export const itemName = (item: ScanListItem, draft: ScanDraft | undefined) =>
  draft?.name?.trim() || item.vendor.name;
