/**
 * Bank layouts the generic column guesser can't read on its own: Revolut (only COMPLETED rows
 * are real), AIB (split Debit / Credit columns and three description columns) and any other
 * statement with separate money-out / money-in columns. Each is rewritten to a plain
 * Date / Description / Amount / Currency table before the generic dataio pipeline runs.
 */
import { columnsGuessFrom } from '../dataio/inspect';
import { normaliseText } from '../dataio/labels';
import { type ParsedTable } from '../dataio/normalise';
import { type AmountSign, type DateFormat, type ImportMapping } from '../dataio/types';

export type StatementLayout = 'revolut' | 'aib' | 'debit_credit' | 'generic';

export interface PreparedStatement {
  table: ParsedTable;
  amountSign: AmountSign;
  dateFormat: DateFormat;
  mapping: ImportMapping;
  /** The only currency in the file, when there is a currency column with one value. */
  currency: string | null;
  layout: StatementLayout;
}

export type StatementTableProblem = 'empty_file' | 'not_statement';

/** A statement needs at least a date, a description and an amount. */
const MIN_STATEMENT_COLUMNS = 3;
const GARBLED_SAMPLE_ROWS = 50;
/** Tolerates the odd badly encoded character in a real export; binary files are far above it. */
const MAX_GARBLED_SHARE = 0.05;

const isGarbledChar = (char: string) => {
  const code = char.charCodeAt(0);
  return 0xfffd === code || (32 > code && 9 !== code && 10 !== code && 13 !== code);
};

/**
 * Why this table can't be a statement, or null when it can: nothing to scan, too few columns
 * to ever fill in the column step, or binary data with a .csv name.
 */
export const statementTableProblem = ({
  headers,
  rows,
}: Pick<ParsedTable, 'headers' | 'rows'>): StatementTableProblem | null => {
  const filledRows = rows.filter((row) => row.some((value) => '' !== value.trim()));
  if (0 === filledRows.length) {
    return 'empty_file';
  }
  if (MIN_STATEMENT_COLUMNS > headers.filter((header) => '' !== header.trim()).length) {
    return 'not_statement';
  }
  const sample = [headers, ...filledRows.slice(0, GARBLED_SAMPLE_ROWS)].flat().join('').split('');
  const garbled = sample.filter(isGarbledChar).length;
  return MAX_GARBLED_SHARE < garbled / Math.max(sample.length, 1) ? 'not_statement' : null;
};

const CANONICAL_HEADERS = ['Date', 'Description', 'Amount', 'Currency'];

/** Revolut states that never reached the account. */
const REVOLUT_DROP_STATES = new Set(['reverted', 'declined', 'failed', 'pending']);
/** Revolut types that only move money between the user's own pockets. */
const REVOLUT_DROP_TYPES = new Set(['topup', 'exchange']);

const DEBIT_HEADERS = ['debit amount', 'debit', 'paid out', 'money out', 'withdrawals', 'out'];
const CREDIT_HEADERS = ['credit amount', 'credit', 'paid in', 'money in', 'deposits', 'in'];
const DATE_HEADERS = [
  'posted transactions date',
  'transaction date',
  'posting date',
  'posted date',
  'date',
  'booking date',
  'value date',
];
const CURRENCY_HEADERS = ['posted currency', 'currency', 'ccy'];

const indexOfAny = (headers: readonly string[], names: readonly string[]): number | null => {
  const found = names.map((name) => headers.indexOf(name)).find((index) => -1 !== index);
  return undefined === found ? null : found;
};

const cell = (row: readonly string[], index: number | null) =>
  null === index ? '' : (row[index] ?? '').trim();

/** Debit cells become negative amounts so the pipeline treats credits as income. */
const signedAmount = (debit: string, credit: string) => {
  if ('' !== debit) {
    return `-${debit.replace(/^[-+]/, '')}`;
  }
  return credit.replace(/^\+/, '');
};

const revolutTable = (table: ParsedTable, headers: readonly string[]): ParsedTable => {
  const state = headers.indexOf('state');
  const type = headers.indexOf('type');
  const date = indexOfAny(headers, ['started date', 'completed date']);
  const description = headers.indexOf('description');
  const amount = headers.indexOf('amount');
  const currency = headers.indexOf('currency');
  const rows = table.rows
    .filter((row) => !REVOLUT_DROP_STATES.has(normaliseText(cell(row, state))))
    .filter((row) => !REVOLUT_DROP_TYPES.has(normaliseText(cell(row, type)).replace(/\s/g, '')))
    .map((row) => [
      cell(row, date),
      cell(row, description),
      cell(row, amount),
      cell(row, currency),
    ]);
  return { headers: CANONICAL_HEADERS, rows };
};

const debitCreditTable = (
  table: ParsedTable,
  headers: readonly string[],
  debit: number,
  credit: number,
): ParsedTable => {
  const date = indexOfAny(headers, DATE_HEADERS);
  const currency = indexOfAny(headers, CURRENCY_HEADERS);
  const descriptions = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /^(description|details|narrative|memo)\s?\d*$/.test(header))
    .map(({ index }) => index);
  const rows = table.rows.map((row) => [
    cell(row, date),
    descriptions
      .map((index) => cell(row, index))
      .filter(Boolean)
      .join(' '),
    signedAmount(cell(row, debit), cell(row, credit)),
    cell(row, currency),
  ]);
  return { headers: CANONICAL_HEADERS, rows };
};

const rewrite = (table: ParsedTable): { table: ParsedTable; layout: StatementLayout } => {
  const headers = table.headers.map(normaliseText);
  const isRevolut =
    headers.includes('state') &&
    headers.includes('started date') &&
    headers.includes('description') &&
    headers.includes('amount');
  if (isRevolut) {
    return { table: revolutTable(table, headers), layout: 'revolut' };
  }
  const debit = indexOfAny(headers, DEBIT_HEADERS);
  const credit = indexOfAny(headers, CREDIT_HEADERS);
  if (null === debit || null === credit) {
    return { table, layout: 'generic' };
  }
  const isAib = headers.includes('description1') && headers.includes('posted transactions date');
  return {
    table: debitCreditTable(table, headers, debit, credit),
    layout: isAib ? 'aib' : 'debit_credit',
  };
};

/**
 * Normalise known bank layouts, then guess the mapping, date order and amount sign with the
 * shared dataio inspector.
 */
export const prepareStatementTable = (table: ParsedTable): PreparedStatement => {
  const { table: prepared, layout } = rewrite(table);
  const inspection = columnsGuessFrom(prepared);
  return {
    table: prepared,
    amountSign: inspection.amountSign,
    dateFormat: inspection.dateFormat,
    mapping: inspection.mapping,
    currency: inspection.currency,
    layout,
  };
};
