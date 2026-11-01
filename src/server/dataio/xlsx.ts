import type { CellValue, Workbook as WorkbookType, Worksheet } from 'exceljs';

import { calendarDateToUtcMidnight, formatCalendarDate } from './dates';
import { currencyDigits, minorToDecimal } from './decimal';
import { type ExportRow, summariseRows } from './exportRows';
import { type ExportLabels } from './labels';
import { type ParsedTable } from './normalise';
import { EXPORT_COLUMNS, type ExportColumn, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from './types';

type WorkbookConstructor = new () => WorkbookType;
/** CommonJS interop: the classes sit on the module or on its default export. */
interface ExcelModule {
  Workbook?: WorkbookConstructor;
  default?: { Workbook?: WorkbookConstructor };
}

/** The exceljs module is loaded on demand so it never lands in page bundles or slows cold starts. */
const loadWorkbook = async (): Promise<WorkbookType> => {
  const mod: ExcelModule = await import('exceljs');
  const Workbook = mod.default?.Workbook ?? mod.Workbook;
  if (!Workbook) {
    throw new Error('exceljs failed to load');
  }
  return new Workbook();
};

export const EXPENSES_SHEET = 'Expenses';
export const SUMMARY_SHEET = 'Summary';

const COLUMN_WIDTHS: Record<ExportColumn, number> = {
  date: 12,
  description: 36,
  category: 18,
  categoryKey: 16,
  amount: 14,
  currency: 10,
  paidBy: 18,
  yourShare: 14,
  splitType: 14,
  project: 20,
  participants: 30,
  recurring: 12,
  notes: 30,
  needsReview: 14,
  expenseId: 38,
};

const numberFormat = (currency: string) => {
  const digits = currencyDigits(currency);
  return 0 === digits ? '#,##0' : `#,##0.${'0'.repeat(digits)}`;
};

/** Spreadsheet numbers are binary floats; the decimal string is the exact source value. */
const toNumber = (amount: bigint, currency: string) =>
  Number(minorToDecimal(amount, currencyDigits(currency)));

const styleHeader = (sheet: Worksheet, rowNumber: number) => {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.alignment = { vertical: 'middle' };
};

const writeExpensesSheet = (
  workbook: WorkbookType,
  rows: readonly ExportRow[],
  labels: ExportLabels,
) => {
  const sheet = workbook.addWorksheet(EXPENSES_SHEET, {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: 'ar' === labels.locale }],
  });
  sheet.columns = EXPORT_COLUMNS.map((column) => ({
    header: labels.columns[column],
    key: column,
    width: COLUMN_WIDTHS[column],
  }));
  styleHeader(sheet, 1);
  rows.forEach((row) => {
    const added = sheet.addRow({
      ...row,
      date: calendarDateToUtcMidnight(row.date),
      amount: toNumber(row.amountMinor, row.currency),
      yourShare: toNumber(row.yourShareMinor, row.currency),
    });
    const format = numberFormat(row.currency);
    added.getCell('date').numFmt = 'yyyy-mm-dd';
    added.getCell('amount').numFmt = format;
    added.getCell('yourShare').numFmt = format;
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };
};

const writeSummarySheet = (
  workbook: WorkbookType,
  rows: readonly ExportRow[],
  labels: ExportLabels,
) => {
  const { byCurrency, byCategory } = summariseRows(rows);
  const { summary } = labels;
  const sheet = workbook.addWorksheet(SUMMARY_SHEET, {
    views: [{ rightToLeft: 'ar' === labels.locale }],
  });
  sheet.columns = [
    { width: 24 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
  ];

  const title = sheet.addRow([summary.by_currency]);
  title.font = { bold: true, size: 13 };
  styleHeader(
    sheet,
    sheet.addRow([summary.currency, summary.count, summary.total, summary.your_share]).number,
  );
  byCurrency.forEach((total) => {
    const row = sheet.addRow([
      total.currency,
      total.count,
      toNumber(total.totalMinor, total.currency),
      toNumber(total.yourShareMinor, total.currency),
    ]);
    row.getCell(3).numFmt = numberFormat(total.currency);
    row.getCell(4).numFmt = numberFormat(total.currency);
  });

  sheet.addRow([]);
  const categoryTitle = sheet.addRow([summary.by_category]);
  categoryTitle.font = { bold: true, size: 13 };
  styleHeader(
    sheet,
    sheet.addRow([
      summary.category,
      summary.category_key,
      summary.currency,
      summary.count,
      summary.total,
      summary.your_share,
    ]).number,
  );
  byCategory.forEach((total) => {
    const row = sheet.addRow([
      total.category,
      total.categoryKey,
      total.currency,
      total.count,
      toNumber(total.totalMinor, total.currency),
      toNumber(total.yourShareMinor, total.currency),
    ]);
    row.getCell(5).numFmt = numberFormat(total.currency);
    row.getCell(6).numFmt = numberFormat(total.currency);
  });
};

/** Build the .xlsx export: an "Expenses" sheet with typed cells and a "Summary" sheet. */
export const buildXlsx = async (
  rows: readonly ExportRow[],
  labels: ExportLabels,
): Promise<Buffer> => {
  const workbook = await loadWorkbook();
  workbook.creator = 'Safi';
  workbook.created = new Date();
  writeExpensesSheet(workbook, rows, labels);
  writeSummarySheet(workbook, rows, labels);
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
};

const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;

/**
 * Zip-bomb guard: sum the uncompressed sizes in the zip central directory before handing the
 * file to exceljs. Returns false for anything that is not a sane, small zip.
 */
export const isSafeZip = (buffer: Buffer): boolean => {
  const minEocd = 22;
  if (buffer.length < minEocd || 0x04034b50 !== buffer.readUInt32LE(0)) {
    return false;
  }
  const searchStart = Math.max(0, buffer.length - minEocd - 0xffff);
  let eocd = -1;
  for (let i = buffer.length - minEocd; i >= searchStart; i -= 1) {
    if (0x06054b50 === buffer.readUInt32LE(i)) {
      eocd = i;
      break;
    }
  }
  if (-1 === eocd) {
    return false;
  }
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  let total = 0;
  for (let entry = 0; entry < entries; entry += 1) {
    if (offset + 46 > buffer.length || 0x02014b50 !== buffer.readUInt32LE(offset)) {
      return false;
    }
    const uncompressed = buffer.readUInt32LE(offset + 24);
    total += uncompressed;
    if (0xffffffff === uncompressed || MAX_UNZIPPED_BYTES < total) {
      return false;
    }
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return true;
};

/** Plain text of a cell, with dates as YYYY-MM-DD and numbers without float noise. */
export const cellToText = (value: CellValue): string => {
  if (null === value || undefined === value) {
    return '';
  }
  if (value instanceof Date) {
    return formatCalendarDate({
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    });
  }
  if ('number' === typeof value) {
    return Number.isFinite(value)
      ? Number(value.toPrecision(15)).toLocaleString('en-US', {
          useGrouping: false,
          maximumFractionDigits: 10,
        })
      : '';
  }
  if ('string' === typeof value) {
    return value;
  }
  if ('boolean' === typeof value) {
    return value ? 'true' : 'false';
  }
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('formula' in value || 'sharedFormula' in value) {
    return cellToText((value as { result?: CellValue }).result ?? null);
  }
  if ('text' in value && 'hyperlink' in value) {
    return 'string' === typeof value.text ? value.text : cellToText(value.text);
  }
  if ('error' in value) {
    return '';
  }
  return '';
};

export class TableTooLargeError extends Error {}

/** Read the first (or "Expenses") sheet of an .xlsx file into header + rows of text. */
export const readXlsx = async (buffer: Buffer): Promise<ParsedTable> => {
  if (!isSafeZip(buffer)) {
    throw new Error('Not a valid .xlsx file');
  }
  const workbook = await loadWorkbook();
  // A fresh ArrayBuffer copy: exceljs types its input as a plain ArrayBuffer.
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  const sheet = workbook.getWorksheet(EXPENSES_SHEET) ?? workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [] };
  }
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (MAX_IMPORT_ROWS + 1 < rows.length) {
      return;
    }
    const width = Math.min(row.cellCount, MAX_IMPORT_COLUMNS);
    const cells = Array.from({ length: width }, (_, i) =>
      cellToText(row.getCell(i + 1).value).trim(),
    );
    if (cells.some((cell) => '' !== cell)) {
      rows.push(cells);
    }
  });
  if (MAX_IMPORT_ROWS + 1 < rows.length) {
    throw new TableTooLargeError('Too many rows');
  }
  const [headers = [], ...body] = rows;
  return { headers, rows: body };
};
