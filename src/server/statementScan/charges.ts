import { type ImportRow, type ParsedTable, normaliseRows } from '../dataio/normalise';

import { detectInvoiceExport, invoiceRowsToCharges } from './invoiceExport';
import { prepareStatementTable } from './statementColumns';
import { type ScanSource, type StatementCharge } from './types';

/** A zero-amount card check is still evidence of a trial, so only that error is tolerated. */
const isUsable = (row: ImportRow) =>
  null === row.skip &&
  null !== row.date &&
  null !== row.amountMinor &&
  row.errors.every((error) => 'zero_amount' === error);

/**
 * Convert the dataio import pipeline output into outgoing charges. Rows with errors or a skip
 * reason (income, refunds, summary lines) are left out; amounts are made positive. With
 * `amountSign: 'negative'` the pipeline has already marked credits as income.
 */
export const importRowsToCharges = (rows: readonly ImportRow[]): StatementCharge[] =>
  rows.filter(isUsable).flatMap((row) => {
    if (null === row.date || null === row.amountMinor) {
      return [];
    }
    return [
      {
        line: row.line,
        date: row.date,
        description: row.description,
        amountMinor: 0n > row.amountMinor ? -row.amountMinor : row.amountMinor,
        currency: row.currency,
      },
    ];
  });

export interface TableCharges {
  source: ScanSource;
  charges: StatementCharge[];
  /** Data rows in the file (after the header), before any filtering. */
  scannedRows: number;
}

/**
 * Whole read step for one uploaded table: SaaS invoice exports are read with their billing
 * periods; anything else goes through the bank layout fixes and the generic import pipeline.
 */
export const tableToCharges = (table: ParsedTable, defaultCurrency: string): TableCharges => {
  const layout = detectInvoiceExport(table.headers);
  if (layout) {
    return {
      source: 'invoice_export',
      charges: invoiceRowsToCharges(table, layout, defaultCurrency),
      scannedRows: table.rows.length,
    };
  }
  const prepared = prepareStatementTable(table);
  const rows = normaliseRows(prepared.table, {
    format: 'generic',
    mapping: prepared.mapping,
    dateFormat: prepared.dateFormat,
    defaultCurrency: prepared.currency ?? defaultCurrency,
    amountSign: prepared.amountSign,
  });
  return {
    source: 'statement',
    charges: importRowsToCharges(rows),
    scannedRows: table.rows.length,
  };
};
