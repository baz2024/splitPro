/**
 * SaaS billing exports (Stripe-style invoice lists, generic invoice exports with billing
 * periods, simple invoice lists, the GitHub billing usage report). Unlike bank statements they
 * name the vendor or product and often the billing period, which gives the cadence directly.
 */
import { isCurrencyCode } from '~/lib/currency';

import { type CalendarDate, guessDateFormat, parseDateCell } from '../dataio/dates';
import { currencyDigits, decimalToMinor } from '../dataio/decimal';
import { type ParsedTable } from '../dataio/normalise';
import { type DateFormat } from '../dataio/types';

import { type StatementCharge } from './types';

export type InvoiceExportKind = 'stripe' | 'billing_period' | 'invoice_list' | 'github_usage';

/** Column indexes for a recognised invoice export (null when the column is absent). */
export interface InvoiceExportLayout {
  kind: InvoiceExportKind;
  date: number;
  amount: number | null;
  currency: number | null;
  periodStart: number | null;
  periodEnd: number | null;
  /** One cell holding both ends: "2026-05-01 – 2026-05-31". */
  period: number | null;
  description: number | null;
  product: number | null;
  vendor: number | null;
  status: number | null;
  invoice: number | null;
  quantity: number | null;
  unitPrice: number | null;
  multiplier: number | null;
}

const normaliseHeader = (header: string) =>
  header
    .toLowerCase()
    .replace(/\((?:utc|\$|usd|gmt)\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const COLUMNS = {
  date: ['invoice date', 'created', 'date', 'issued', 'issue date', 'billing date', 'date paid'],
  amount: ['amount paid', 'total', 'amount due', 'amount', 'total amount', 'net amount'],
  stripeAmount: ['amount paid', 'total', 'amount due'],
  currency: ['currency', 'currency code'],
  periodStart: [
    'period start',
    'service period start',
    'billing period start',
    'period from',
    'start date',
  ],
  periodEnd: ['period end', 'service period end', 'billing period end', 'period to', 'end date'],
  period: ['billing period', 'service period', 'period'],
  description: ['description', 'line item', 'item', 'memo'],
  product: ['product', 'plan', 'product name', 'plan name', 'sku name'],
  vendor: ['vendor', 'supplier', 'merchant', 'provider', 'seller', 'service'],
  status: ['status', 'payment status', 'state'],
  invoice: ['invoice', 'invoice number', 'invoice id', 'invoice no', 'number'],
  sku: ['sku'],
  quantity: ['quantity'],
  unitType: ['unit type'],
  unitPrice: ['price per unit'],
  multiplier: ['multiplier'],
  bankOnly: ['balance', 'debit', 'credit', 'debit amount', 'credit amount'],
} as const satisfies Record<string, readonly string[]>;

type ColumnName = keyof typeof COLUMNS;

const finder = (headers: readonly string[]) => {
  const normalised = headers.map(normaliseHeader);
  return (name: ColumnName): number | null => {
    const found = COLUMNS[name]
      .map((candidate) => normalised.indexOf(candidate))
      .find((index) => -1 !== index);
    return undefined === found ? null : found;
  };
};

/** Recognise an invoice / billing export from its headers (case-insensitive), else null. */
export const detectInvoiceExport = (headers: readonly string[]): InvoiceExportLayout | null => {
  const find = finder(headers);
  const date = find('date');
  if (null === date) {
    return null;
  }
  const base = {
    date,
    amount: find('amount'),
    currency: find('currency'),
    periodStart: find('periodStart'),
    periodEnd: find('periodEnd'),
    period: find('period'),
    description: find('description'),
    product: find('product'),
    vendor: find('vendor'),
    status: find('status'),
    invoice: find('invoice'),
    quantity: find('quantity'),
    unitPrice: find('unitPrice'),
    multiplier: find('multiplier'),
  };
  const isGithubUsage =
    null !== base.product &&
    null !== find('sku') &&
    null !== base.quantity &&
    null !== find('unitType') &&
    null !== base.unitPrice;
  if (isGithubUsage) {
    return { kind: 'github_usage', ...base, amount: null };
  }
  if (null === base.amount || null !== find('bankOnly')) {
    return null;
  }
  const hasPeriods = null !== base.periodStart && null !== base.periodEnd;
  const stripeAmount = find('stripeAmount');
  if (hasPeriods && null !== base.currency && null !== stripeAmount) {
    return { kind: 'stripe', ...base, amount: stripeAmount };
  }
  if (hasPeriods || null !== base.period) {
    return { kind: 'billing_period', ...base };
  }
  if (null !== base.invoice && null !== base.status) {
    return { kind: 'invoice_list', ...base };
  }
  return null;
};

/** Statuses of invoices that were never paid. */
const UNPAID = new Set([
  'void',
  'voided',
  'draft',
  'unpaid',
  'open',
  'uncollectible',
  'failed',
  'past due',
  'overdue',
  'deleted',
  'refunded',
  'cancelled',
  'canceled',
  'pending',
]);

const cellOf = (row: readonly string[], index: number | null) =>
  null === index ? '' : (row[index] ?? '').trim();

const columnSamples = (table: ParsedTable, indexes: readonly (number | null)[]) =>
  indexes.flatMap((index) =>
    table.rows
      .slice(0, 200)
      .map((row) => cellOf(row, index))
      .filter(Boolean),
  );

const PERIOD_SPLIT = /\s+(?:-|–|—|to)\s+|\s*[–—]\s*/;

const parsePeriod = (
  raw: string,
  format: DateFormat,
): { start: CalendarDate; end: CalendarDate } | null => {
  const [startText = '', endText = ''] = raw.split(PERIOD_SPLIT);
  const start = parseDateCell(startText, format);
  const end = parseDateCell(endText, format);
  return start && end ? { start, end } : null;
};

const humanise = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');

const currencyFor = (raw: string, fallback: string) => {
  const upper = raw.toUpperCase();
  return isCurrencyCode(upper) ? upper : fallback;
};

const invoiceCharge = (
  row: readonly string[],
  line: number,
  layout: InvoiceExportLayout,
  format: DateFormat,
  defaultCurrency: string,
): StatementCharge | null => {
  if (UNPAID.has(cellOf(row, layout.status).toLowerCase())) {
    return null;
  }
  const date = parseDateCell(cellOf(row, layout.date), format);
  const currency = currencyFor(cellOf(row, layout.currency), defaultCurrency);
  const amount = decimalToMinor(cellOf(row, layout.amount), currencyDigits(currency));
  // Credit notes and zero invoices are not charges.
  if (!date || !amount.ok || 0n >= amount.value) {
    return null;
  }
  const combined = parsePeriod(cellOf(row, layout.period), format);
  const start = parseDateCell(cellOf(row, layout.periodStart), format) ?? combined?.start;
  const end = parseDateCell(cellOf(row, layout.periodEnd), format) ?? combined?.end;
  const product = cellOf(row, layout.product);
  const description =
    cellOf(row, layout.description) || product || cellOf(row, layout.invoice) || 'Invoice';
  const vendorHint = cellOf(row, layout.vendor) || product || 'unknown';
  return {
    line,
    date,
    description,
    amountMinor: amount.value,
    currency,
    ...(start && end ? { periodStart: start, periodEnd: end } : {}),
    vendorHint,
  };
};

/** Exact decimal → integer scaled by 10^9 ("0.008" → 8_000_000n). */
const SCALE_DIGITS = 9;
const scaled = (raw: string, fallback: bigint): bigint => {
  if ('' === raw) {
    return fallback;
  }
  const parsed = decimalToMinor(raw, SCALE_DIGITS);
  return parsed.ok ? parsed.value : fallback;
};

const ONE = 10n ** BigInt(SCALE_DIGITS);

const roundDiv = (value: bigint, divisor: bigint) => (value + divisor / 2n) / divisor;

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** GitHub usage report: one row per day per SKU; summed per month per product. */
const githubUsageCharges = (
  table: ParsedTable,
  layout: InvoiceExportLayout,
  format: DateFormat,
): StatementCharge[] => {
  const totals = table.rows.reduce((acc, row, index) => {
    const date = parseDateCell(cellOf(row, layout.date), format);
    const product = cellOf(row, layout.product);
    if (!date || '' === product) {
      return acc;
    }
    // Quantity × price × multiplier, at 10^27 scale → cents.
    const cost =
      scaled(cellOf(row, layout.quantity), 0n) *
      scaled(cellOf(row, layout.unitPrice), 0n) *
      scaled(cellOf(row, layout.multiplier), ONE);
    const key = `${date.year}-${date.month}|${product.toLowerCase()}`;
    const previous = acc.get(key);
    acc.set(key, {
      year: date.year,
      month: date.month,
      product,
      cost: (previous?.cost ?? 0n) + cost,
      line: previous?.line ?? index + 2,
    });
    return acc;
  }, new Map<string, { year: number; month: number; product: string; cost: bigint; line: number }>());
  const toCents = (ONE * ONE * ONE) / 100n;
  return [...totals.values()].flatMap((entry) => {
    const amountMinor = roundDiv(entry.cost, toCents);
    if (0n >= amountMinor) {
      return [];
    }
    const end = { year: entry.year, month: entry.month, day: daysInMonth(entry.year, entry.month) };
    return [
      {
        line: entry.line,
        date: end,
        description: `GitHub ${humanise(entry.product)}`,
        amountMinor,
        currency: 'USD',
        periodStart: { year: entry.year, month: entry.month, day: 1 },
        periodEnd: end,
        vendorHint: 'github',
      },
    ];
  });
};

/** Read the paid rows of an invoice export as charges (with billing periods when present). */
export const invoiceRowsToCharges = (
  table: ParsedTable,
  layout: InvoiceExportLayout,
  defaultCurrency: string,
): StatementCharge[] => {
  const format = guessDateFormat(
    columnSamples(table, [layout.date, layout.periodStart, layout.periodEnd]),
  );
  if ('github_usage' === layout.kind) {
    return githubUsageCharges(table, layout, format);
  }
  return table.rows.flatMap((row, index) => {
    const charge = invoiceCharge(row, index + 2, layout, format, defaultCurrency);
    return charge ? [charge] : [];
  });
};
