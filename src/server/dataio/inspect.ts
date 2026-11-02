import { isCurrencyCode } from '~/lib/currency';

import { detectFormat, guessMapping } from './columns';
import { guessDateFormat } from './dates';
import { decimalToMinor } from './decimal';
import { type ParsedTable } from './normalise';
import { type AmountSign, type DateFormat, type ImportFormat, type ImportMapping } from './types';

const SAMPLE_ROWS = 5;
const GUESS_ROWS = 200;

export interface UploadInspection {
  format: ImportFormat;
  headers: string[];
  mapping: ImportMapping;
  rowCount: number;
  sample: string[][];
  dateFormat: DateFormat;
  amountSign: AmountSign;
  currency: string | null;
}

const columnValues = (table: ParsedTable, index: number | null | undefined) =>
  null === index || undefined === index
    ? []
    : table.rows
        .slice(0, GUESS_ROWS)
        .map((row) => (row[index] ?? '').trim())
        .filter(Boolean);

/** Detect the file's format and guess the mapping, date order, sign and currency. */
export const columnsGuessFrom = (table: ParsedTable): UploadInspection => {
  const format = detectFormat(table.headers);
  const mapping = guessMapping(table.headers);
  const amounts = columnValues(table, mapping.amount).flatMap((value) => {
    const parsed = decimalToMinor(value, 2);
    return parsed.ok ? [parsed.value] : [];
  });
  const negatives = amounts.filter((amount) => 0n > amount).length;
  const currencies = new Set(
    columnValues(table, mapping.currency).map((value) => value.toUpperCase()),
  );
  const [onlyCurrency] = [...currencies];
  return {
    format,
    headers: table.headers,
    mapping,
    rowCount: table.rows.length,
    sample: table.rows.slice(0, SAMPLE_ROWS),
    dateFormat: guessDateFormat(columnValues(table, mapping.date)),
    // Bank statements list spending as negative amounts; Safi and Splitwise never do.
    amountSign: 'generic' === format && negatives > amounts.length / 2 ? 'negative' : 'positive',
    currency: 1 === currencies.size && isCurrencyCode(onlyCurrency) ? onlyCurrency : null,
  };
};
