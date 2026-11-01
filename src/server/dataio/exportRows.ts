import { cadenceFromCron } from '~/server/subscriptions/helpers';

import { type CsvCell, toCsv } from './csv';
import { type CalendarDate, calendarDateInZone, formatCalendarDate } from './dates';
import { currencyDigits, minorToDecimal } from './decimal';
import { type ExportLabels, categoryLabel } from './labels';
import { EXPORT_COLUMNS } from './types';

interface ExportUser {
  id: number;
  name: string | null;
  email: string | null;
}

/** The expense shape the export query selects. */
export interface ExportExpense {
  id: string;
  name: string;
  category: string;
  amount: bigint;
  currency: string;
  splitType: string;
  expenseDate: Date;
  needsReview: boolean;
  paidBy: number;
  paidByUser: ExportUser;
  group: { name: string } | null;
  expenseParticipants: { userId: number; amount: bigint; user: ExportUser }[];
  expenseNotes: { note: string }[];
  recurrence: { job: { schedule: string } | null } | null;
}

export interface ExportRow {
  date: CalendarDate;
  description: string;
  category: string;
  categoryKey: string;
  amountMinor: bigint;
  currency: string;
  paidBy: string;
  yourShareMinor: bigint;
  splitType: string;
  project: string;
  participants: string;
  recurring: string;
  notes: string;
  needsReview: string;
  expenseId: string;
}

const displayName = (user: ExportUser) => user.name ?? user.email ?? `#${user.id}`;

/**
 * Your share of an expense. Participant entries are (paid - share); a lone entry is a personal
 * cost whose whole amount is yours, whatever value it stores.
 */
export const yourShare = (expense: ExportExpense, userId: number): bigint => {
  const mine = expense.expenseParticipants.find((p) => p.userId === userId);
  if (!mine) {
    return 0n;
  }
  if (1 === expense.expenseParticipants.length) {
    return expense.amount;
  }
  const paid = expense.paidBy === userId ? expense.amount : 0n;
  return paid - mine.amount;
};

export const toExportRow = (
  expense: ExportExpense,
  { userId, labels, timeZone }: { userId: number; labels: ExportLabels; timeZone: string },
): ExportRow => {
  const schedule = expense.recurrence?.job?.schedule;
  const nameFor = (user: ExportUser) => (user.id === userId ? labels.you : displayName(user));
  return {
    date: calendarDateInZone(expense.expenseDate, timeZone),
    description: expense.name,
    category: categoryLabel(expense.category, labels.locale),
    categoryKey: expense.category,
    amountMinor: expense.amount,
    currency: expense.currency,
    paidBy: nameFor(expense.paidByUser),
    yourShareMinor: yourShare(expense, userId),
    splitType: expense.splitType,
    project: expense.group?.name ?? '',
    participants: expense.expenseParticipants.map((p) => nameFor(p.user)).join('; '),
    recurring: schedule ? labels.cadence[cadenceFromCron(schedule)] : '',
    notes: expense.expenseNotes.map((note) => note.note).join(' | '),
    needsReview: expense.needsReview ? labels.yes : labels.no,
    expenseId: expense.id,
  };
};

const decimal = (amount: bigint, currency: string) =>
  minorToDecimal(amount, currencyDigits(currency));

/** One row of plain text values in {@link EXPORT_COLUMNS} order (amounts as exact decimals). */
export const exportRowCells = (row: ExportRow): CsvCell[] =>
  EXPORT_COLUMNS.map((column): CsvCell => {
    switch (column) {
      case 'date':
        return formatCalendarDate(row.date);
      case 'amount':
        return { numeric: decimal(row.amountMinor, row.currency) };
      case 'yourShare':
        return { numeric: decimal(row.yourShareMinor, row.currency) };
      default:
        return row[column];
    }
  });

export const buildCsv = (rows: readonly ExportRow[], labels: ExportLabels): string =>
  toCsv([EXPORT_COLUMNS.map((column) => labels.columns[column]), ...rows.map(exportRowCells)]);

export interface CurrencyTotal {
  currency: string;
  count: number;
  totalMinor: bigint;
  yourShareMinor: bigint;
}

export interface CategoryTotal extends CurrencyTotal {
  categoryKey: string;
  category: string;
}

export const summariseRows = (rows: readonly ExportRow[]) => {
  const byCurrency = new Map<string, CurrencyTotal>();
  const byCategory = new Map<string, CategoryTotal>();
  rows.forEach((row) => {
    const currencyTotal = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      count: 0,
      totalMinor: 0n,
      yourShareMinor: 0n,
    };
    currencyTotal.count += 1;
    currencyTotal.totalMinor += row.amountMinor;
    currencyTotal.yourShareMinor += row.yourShareMinor;
    byCurrency.set(row.currency, currencyTotal);

    const key = `${row.categoryKey}|${row.currency}`;
    const categoryTotal = byCategory.get(key) ?? {
      categoryKey: row.categoryKey,
      category: row.category,
      currency: row.currency,
      count: 0,
      totalMinor: 0n,
      yourShareMinor: 0n,
    };
    categoryTotal.count += 1;
    categoryTotal.totalMinor += row.amountMinor;
    categoryTotal.yourShareMinor += row.yourShareMinor;
    byCategory.set(key, categoryTotal);
  });
  const byCurrencyList = [...byCurrency.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
  const byCategoryList = [...byCategory.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.currency.localeCompare(b.currency),
  );
  return { byCurrency: byCurrencyList, byCategory: byCategoryList };
};
