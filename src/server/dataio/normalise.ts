import { type CategoryItem } from '~/lib/category';
import { isCurrencyCode } from '~/lib/currency';

import { unguardFormula } from './csv';
import { type CalendarDate, formatCalendarDate, parseDateCell } from './dates';
import { currencyDigits, decimalToMinor, minorToDecimal } from './decimal';
import { normaliseText, resolveCategory } from './labels';
import {
  type AmountSign,
  type DateFormat,
  type ImportFormat,
  type ImportMapping,
  type IssueCode,
  type PreviewRow,
} from './types';

export const MAX_DESCRIPTION_LENGTH = 200;
const MAX_NOTE_LENGTH = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRUTHY = new Set(['yes', 'true', '1', 'y', 'x', 'نعم'].map(normaliseText));

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export interface NormaliseOptions {
  format: ImportFormat;
  mapping: ImportMapping;
  dateFormat: DateFormat;
  defaultCurrency: string;
  amountSign: AmountSign;
}

/** A parsed, validated import row. Errors fail the row; skip issues leave it out on purpose. */
export interface ImportRow {
  index: number;
  line: number;
  date: CalendarDate | null;
  description: string;
  amountMinor: bigint | null;
  currency: string;
  category: CategoryItem;
  notes: string | null;
  needsReview: boolean;
  expenseId: string | null;
  errors: IssueCode[];
  skip: IssueCode | null;
}

const SKIP_DESCRIPTIONS = new Set(
  ['total balance', 'total', 'totals', 'الاجمالي'].map(normaliseText),
);

const cellOf = (row: string[], index: number | null | undefined, format: ImportFormat) => {
  if (null === index || undefined === index) {
    return '';
  }
  const value = (row[index] ?? '').trim();
  return 'safi' === format ? unguardFormula(value) : value;
};

const readAmount = (
  raw: string,
  currency: string,
  amountSign: AmountSign,
): { minor: bigint | null; error: IssueCode | null; skip: IssueCode | null } => {
  if ('' === raw) {
    return { minor: null, error: 'missing_amount', skip: null };
  }
  const parsed = decimalToMinor(raw, currencyDigits(currency));
  if (!parsed.ok) {
    return { minor: null, error: parsed.error, skip: null };
  }
  if (0n === parsed.value) {
    return { minor: 0n, error: 'zero_amount', skip: null };
  }
  const isSpending = 'negative' === amountSign ? 0n > parsed.value : 0n < parsed.value;
  if (!isSpending) {
    return {
      minor: parsed.value,
      error: null,
      skip: 'negative' === amountSign ? 'income' : 'refund',
    };
  }
  return { minor: 0n > parsed.value ? -parsed.value : parsed.value, error: null, skip: null };
};

/** Turn raw table rows into validated import rows (pure; no database access). */
export const normaliseRows = (table: ParsedTable, options: NormaliseOptions): ImportRow[] => {
  const { mapping, format } = options;
  return table.rows.map((row, index): ImportRow => {
    const cell = (field: keyof ImportMapping) => cellOf(row, mapping[field], format);
    const errors: IssueCode[] = [];
    let skip: IssueCode | null = null;

    const description = cell('description').replace(/\s+/g, ' ');
    if ('' === description) {
      errors.push('missing_description');
    } else if (MAX_DESCRIPTION_LENGTH < description.length) {
      errors.push('description_too_long');
    }

    const rawDate = cell('date');
    const date = '' === rawDate ? null : parseDateCell(rawDate, options.dateFormat);
    if ('' === rawDate) {
      errors.push('missing_date');
    } else if (!date) {
      errors.push('invalid_date');
    }

    const rawCurrency = cell('currency').toUpperCase();
    const currency = '' === rawCurrency ? options.defaultCurrency : rawCurrency;
    if (!isCurrencyCode(currency)) {
      errors.push('invalid_currency');
    }

    const amount = readAmount(cell('amount'), currency, options.amountSign);
    if (amount.error) {
      errors.push(amount.error);
    }
    skip = amount.skip;

    const categoryLabel = cell('category');
    if ('splitwise' === format && 'payment' === normaliseText(categoryLabel)) {
      skip = 'settlement';
    }
    if (SKIP_DESCRIPTIONS.has(normaliseText(description)) && '' === rawDate) {
      // Splitwise and many spreadsheets end with a totals line; it is not an expense.
      skip = 'summary_row';
      errors.length = 0;
    }

    const rawId = cell('expenseId');
    const notes = cell('notes').slice(0, MAX_NOTE_LENGTH);

    return {
      index,
      line: index + 2,
      date,
      description: description.slice(0, MAX_DESCRIPTION_LENGTH),
      amountMinor: amount.minor,
      currency,
      category: resolveCategory({ key: cell('categoryKey'), label: categoryLabel, description }),
      notes: '' === notes ? null : notes,
      needsReview: TRUTHY.has(normaliseText(cell('needsReview'))),
      expenseId: UUID.test(rawId) ? rawId.toLowerCase() : null,
      errors,
      skip,
    };
  });
};

/** Key for "same date + amount + description" duplicate detection. */
export const duplicateKey = (date: CalendarDate, amount: bigint, currency: string, name: string) =>
  `${formatCalendarDate(date)}|${currency}|${amount}|${normaliseText(name)}`;

export interface ExistingExpense {
  id: string;
  date: CalendarDate;
  amount: bigint;
  currency: string;
  name: string;
}

/** Duplicate status per row: same expense ID, or same date + amount + description. */
export const findDuplicates = (
  rows: readonly ImportRow[],
  existing: readonly ExistingExpense[],
): Map<number, 'duplicate_id' | 'duplicate_details'> => {
  const ids = new Set(existing.map((expense) => expense.id.toLowerCase()));
  const keys = new Set(
    existing.map((expense) =>
      duplicateKey(expense.date, expense.amount, expense.currency, expense.name),
    ),
  );
  return rows.reduce((acc, row) => {
    if (row.expenseId && ids.has(row.expenseId)) {
      acc.set(row.index, 'duplicate_id');
    } else if (
      row.date &&
      null !== row.amountMinor &&
      keys.has(duplicateKey(row.date, row.amountMinor, row.currency, row.description))
    ) {
      acc.set(row.index, 'duplicate_details');
    }
    return acc;
  }, new Map<number, 'duplicate_id' | 'duplicate_details'>());
};

export const isImportable = (row: ImportRow) => 0 === row.errors.length && null === row.skip;

export const toPreviewRow = (
  row: ImportRow,
  duplicate: 'duplicate_id' | 'duplicate_details' | null,
): PreviewRow => ({
  index: row.index,
  line: row.line,
  date: row.date ? formatCalendarDate(row.date) : null,
  description: row.description,
  amount:
    null === row.amountMinor ? null : minorToDecimal(row.amountMinor, currencyDigits(row.currency)),
  currency: row.currency,
  category: row.category,
  notes: row.notes,
  status: 0 < row.errors.length ? 'error' : row.skip ? 'skip' : 'ok',
  issues: [...row.errors, ...(row.skip ? [row.skip] : []), ...(duplicate ? [duplicate] : [])],
  duplicate,
});
