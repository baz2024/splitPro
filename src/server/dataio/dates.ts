import { type DateFormat } from './types';

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

const toAsciiDigits = (value: string) =>
  value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));

const isValid = ({ year, month, day }: CalendarDate) => {
  if (1900 > year || 2200 < year || 1 > month || 12 < month || 1 > day) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

const fullYear = (value: number) => (100 > value ? 2000 + value : value);

const monthFromName = (name: string) => {
  const index = MONTHS.findIndex((month) => name.toLowerCase().startsWith(month));
  return -1 === index ? null : index + 1;
};

/** "1 Nov 2026", "Nov 1, 2026", "01-Nov-26". */
const parseNamedMonth = (value: string): CalendarDate | null => {
  const parts = value.split(/[\s,./-]+/).filter(Boolean);
  const monthIndex = parts.findIndex((part) => /^[a-z]{3,}$/i.test(part));
  const month = -1 === monthIndex ? null : monthFromName(parts[monthIndex]!);
  if (null === month) {
    return null;
  }
  const numbers = parts.filter((_, index) => index !== monthIndex).map(Number);
  if (2 > numbers.length || numbers.some((n) => !Number.isInteger(n))) {
    return null;
  }
  const [first = 0, second = 0] = numbers;
  const date =
    31 < first
      ? { year: fullYear(first), month, day: second }
      : { year: fullYear(second), month, day: first };
  return isValid(date) ? date : null;
};

/**
 * Parse a date cell. A leading 4-digit year (ISO, "2026/11/01") is always read as Y-M-D;
 * otherwise `format` decides between D/M/Y and M/D/Y. Any time part is ignored.
 */
export const parseDateCell = (raw: string, format: DateFormat): CalendarDate | null => {
  const value = toAsciiDigits(raw.trim()).replace(/[T\s]\d{1,2}:\d{2}.*$/, '');
  if ('' === value) {
    return null;
  }
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (iso) {
    const date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    return isValid(date) ? date : null;
  }
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (compact) {
    const date = { year: Number(compact[1]), month: Number(compact[2]), day: Number(compact[3]) };
    return isValid(date) ? date : null;
  }
  const parts = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})$/.exec(value);
  if (parts) {
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    const year = fullYear(Number(parts[3]));
    const date = 'MDY' === format ? { year, month: a, day: b } : { year, month: b, day: a };
    return isValid(date) ? date : null;
  }
  return /[a-z]/i.test(value) ? parseNamedMonth(value) : null;
};

/** Guess D/M/Y vs M/D/Y from sample cells; ISO when every sample starts with a year. */
export const guessDateFormat = (samples: string[]): DateFormat => {
  const cleaned = samples.map((sample) => toAsciiDigits(sample.trim())).filter(Boolean);
  if (0 < cleaned.length && cleaned.every((sample) => /^\d{4}[-/.]?\d{1,2}/.test(sample))) {
    return 'ISO';
  }
  const evidence = cleaned.reduce(
    (acc, sample) => {
      const match = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s]/.exec(sample);
      if (!match) {
        return acc;
      }
      if (12 < Number(match[1])) {
        acc.dmy += 1;
      }
      if (12 < Number(match[2])) {
        acc.mdy += 1;
      }
      return acc;
    },
    { dmy: 0, mdy: 0 },
  );
  return evidence.mdy > evidence.dmy ? 'MDY' : 'DMY';
};

const pad = (value: number) => String(value).padStart(2, '0');

export const formatCalendarDate = ({ year, month, day }: CalendarDate) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** Store imported calendar dates at 12:00 UTC so no time zone moves them to another day. */
export const calendarDateToUtcNoon = ({ year, month, day }: CalendarDate) =>
  new Date(Date.UTC(year, month - 1, day, 12));

/** Midnight UTC of a calendar date, which spreadsheets show as that day. */
export const calendarDateToUtcMidnight = ({ year, month, day }: CalendarDate) =>
  new Date(Date.UTC(year, month - 1, day));

const safeTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
};

/** The calendar date of an instant as seen in `timeZone`. */
export const calendarDateInZone = (date: Date, timeZone: string): CalendarDate => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((entry) => entry.type === type)?.value ?? '0');
  return { year: part('year'), month: part('month'), day: part('day') };
};
