import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCsv } from '../dataio/csv';
import { type ImportRow } from '../dataio/normalise';

import { importRowsToCharges, tableToCharges } from './charges';
import { detectInvoiceExport, invoiceRowsToCharges } from './invoiceExport';
import { prepareStatementTable } from './statementColumns';

const readFixture = (name: string) => {
  const [headers = [], ...rows] = parseCsv(
    readFileSync(join(__dirname, 'fixtures', `${name}.csv`), 'utf8'),
  );
  return { headers, rows };
};

describe('detectInvoiceExport', () => {
  it('should recognise Stripe-style invoice exports', () => {
    expect(
      detectInvoiceExport([
        'id',
        'Amount Due',
        'Amount Paid',
        'Currency',
        'Created (UTC)',
        'Period Start (UTC)',
        'Period End (UTC)',
        'Description',
        'Status',
      ]),
    ).toMatchObject({
      kind: 'stripe',
      amount: 2,
      currency: 3,
      date: 4,
      periodStart: 5,
      periodEnd: 6,
    });
  });

  it('should recognise generic exports with a billing period column', () => {
    expect(detectInvoiceExport(['Invoice Date', 'Plan', 'Billing Period', 'Total'])).toMatchObject({
      kind: 'billing_period',
      date: 0,
      product: 1,
      period: 2,
      amount: 3,
    });
    expect(
      detectInvoiceExport(['INVOICE DATE', 'Service Period Start', 'Service Period End', 'Amount']),
    ).toMatchObject({ kind: 'billing_period', periodStart: 1, periodEnd: 2 });
  });

  it('should recognise simple invoice lists (Vercel-like)', () => {
    expect(detectInvoiceExport(['Invoice', 'Date', 'Amount', 'Status'])).toMatchObject({
      kind: 'invoice_list',
      invoice: 0,
      status: 3,
    });
  });

  it('should recognise the GitHub billing usage report', () => {
    expect(readFixture('github-usage').headers).toHaveLength(9);
    expect(detectInvoiceExport(readFixture('github-usage').headers)).toMatchObject({
      kind: 'github_usage',
    });
  });

  it('should not mistake bank statements for invoice exports', () => {
    expect(detectInvoiceExport(['Date', 'Description', 'Amount'])).toBeNull();
    expect(detectInvoiceExport(readFixture('revolut').headers)).toBeNull();
    expect(detectInvoiceExport(readFixture('aib').headers)).toBeNull();
    expect(detectInvoiceExport(['Invoice', 'Date', 'Amount', 'Status', 'Balance'])).toBeNull();
  });
});

describe('invoiceRowsToCharges', () => {
  it('should read paid Stripe invoices with periods and skip void and draft ones', () => {
    const table = readFixture('stripe-invoices');
    const layout = detectInvoiceExport(table.headers);
    expect(layout).not.toBeNull();
    const charges = layout ? invoiceRowsToCharges(table, layout, 'EUR') : [];
    expect(charges).toHaveLength(11);
    expect(charges[0]).toEqual({
      line: 2,
      date: { year: 2025, month: 12, day: 5 },
      description: 'Retool Team (annual)',
      amountMinor: 120000n,
      currency: 'USD',
      periodStart: { year: 2025, month: 12, day: 5 },
      periodEnd: { year: 2026, month: 12, day: 5 },
      vendorHint: 'unknown',
    });
  });

  it('should split a combined billing period and use the plan as vendor hint', () => {
    const table = {
      headers: ['Invoice Date', 'Plan', 'Billing Period', 'Total', 'Status'],
      rows: [
        ['01/10/2026', 'Linear Standard', '01/10/2026 - 31/10/2026', '8.00', 'Paid'],
        ['15/10/2026', 'Linear Standard', '15/10/2026 to 14/11/2026', '8.00', 'Void'],
        ['01/09/2026', 'Credit note', '01/09/2026 - 30/09/2026', '-8.00', 'Paid'],
      ],
    };
    const layout = detectInvoiceExport(table.headers);
    const charges = layout ? invoiceRowsToCharges(table, layout, 'EUR') : [];
    expect(charges).toEqual([
      {
        line: 2,
        date: { year: 2026, month: 10, day: 1 },
        description: 'Linear Standard',
        amountMinor: 800n,
        currency: 'EUR',
        periodStart: { year: 2026, month: 10, day: 1 },
        periodEnd: { year: 2026, month: 10, day: 31 },
        vendorHint: 'Linear Standard',
      },
    ]);
  });

  it('should read a simple invoice list without periods', () => {
    const table = {
      headers: ['Invoice', 'Date', 'Amount', 'Status'],
      rows: [
        ['INV-0012', '2026-09-03', '$20.00', 'Paid'],
        ['INV-0013', '2026-10-03', '$20.00', 'Unpaid'],
      ],
    };
    const layout = detectInvoiceExport(table.headers);
    const charges = layout ? invoiceRowsToCharges(table, layout, 'USD') : [];
    expect(charges).toEqual([
      {
        line: 2,
        date: { year: 2026, month: 9, day: 3 },
        description: 'INV-0012',
        amountMinor: 2000n,
        currency: 'USD',
        vendorHint: 'unknown',
      },
    ]);
  });

  it('should sum the GitHub usage report per month and product', () => {
    const table = readFixture('github-usage');
    const layout = detectInvoiceExport(table.headers);
    const charges = layout ? invoiceRowsToCharges(table, layout, 'EUR') : [];
    const copilot = charges.filter((charge) => 'GitHub Copilot' === charge.description);
    expect(copilot).toHaveLength(6);
    expect(copilot.every((charge) => 1900n === charge.amountMinor)).toBe(true);
    expect(copilot[0]).toMatchObject({
      currency: 'USD',
      vendorHint: 'github',
      periodStart: { year: 2026, month: 5, day: 1 },
      periodEnd: { year: 2026, month: 5, day: 31 },
    });
    expect(charges.some((charge) => 'GitHub Actions' === charge.description)).toBe(true);
  });

  it('should multiply quantity, price and multiplier exactly', () => {
    const table = {
      headers: [
        'Date',
        'Product',
        'SKU',
        'Quantity',
        'Unit Type',
        'Price Per Unit ($)',
        'Multiplier',
      ],
      rows: [
        ['2026-10-01', 'actions', 'Compute - MACOS', '125', 'minute', '0.08', '1.0'],
        ['2026-10-02', 'actions', 'Compute - UBUNTU', '1000', 'minute', '0.008', '0.5'],
        ['2026-10-02', 'packages', 'Data transfer', '0.001', 'gb', '0.5', '1'],
      ],
    };
    const layout = detectInvoiceExport(table.headers);
    const charges = layout ? invoiceRowsToCharges(table, layout, 'USD') : [];
    // 10.00 + 4.00; packages round to zero and are dropped.
    expect(charges.map((charge) => [charge.description, charge.amountMinor])).toEqual([
      ['GitHub Actions', 1400n],
    ]);
  });
});

describe('prepareStatementTable', () => {
  it('should keep only completed Revolut rows', () => {
    const prepared = prepareStatementTable(readFixture('revolut'));
    expect(prepared.layout).toBe('revolut');
    expect(prepared.table.headers).toEqual(['Date', 'Description', 'Amount', 'Currency']);
    expect(prepared.amountSign).toBe('negative');
    expect(prepared.dateFormat).toBe('ISO');
    expect(prepared.table.rows.some((row) => 'Top-Up by *4821' === row[1])).toBe(false);
  });

  it('should merge AIB debit / credit and description columns', () => {
    const prepared = prepareStatementTable(readFixture('aib'));
    expect(prepared.layout).toBe('aib');
    expect(prepared.amountSign).toBe('negative');
    expect(prepared.dateFormat).toBe('DMY');
    expect(prepared.currency).toBe('EUR');
    const chatgpt = prepared.table.rows.find((row) => row[1]?.includes('CHATGPT SUBSCR'));
    expect(chatgpt?.[1]).toMatch(/^VDP-OPENAI \*CHATGPT SUBSCR USD 20\.00@0\.\d{4}$/);
    expect(chatgpt?.[2]).toMatch(/^-18\.\d{2}$/);
  });

  it('should pass other layouts through', () => {
    const prepared = prepareStatementTable(readFixture('amex'));
    expect(prepared.layout).toBe('generic');
    expect(prepared.amountSign).toBe('positive');
  });
});

describe('importRowsToCharges', () => {
  const row = (overrides: Partial<ImportRow>): ImportRow => ({
    index: 0,
    line: 2,
    date: { year: 2026, month: 10, day: 1 },
    description: 'GITHUB',
    amountMinor: 400n,
    currency: 'EUR',
    category: 'general',
    notes: null,
    needsReview: false,
    expenseId: null,
    errors: [],
    skip: null,
    ...overrides,
  });

  it('should keep usable rows, zero-amount card checks, and drop errors and skips', () => {
    const charges = importRowsToCharges([
      row({ line: 2 }),
      row({ line: 3, amountMinor: -500n }),
      row({ line: 4, amountMinor: 0n, errors: ['zero_amount'] }),
      row({ line: 5, skip: 'income' }),
      row({ line: 6, errors: ['invalid_date'], date: null }),
      row({ line: 7, errors: ['invalid_currency'] }),
    ]);
    expect(charges.map((charge) => [charge.line, charge.amountMinor])).toEqual([
      [2, 400n],
      [3, 500n],
      [4, 0n],
    ]);
  });
});

describe('tableToCharges', () => {
  it('should route invoice exports and statements', () => {
    expect(tableToCharges(readFixture('stripe-invoices'), 'EUR').source).toBe('invoice_export');
    const statement = tableToCharges(readFixture('amex'), 'EUR');
    expect(statement.source).toBe('statement');
    // Payments to the card and refunds are negative on Amex and left out.
    expect(statement.charges.some((charge) => charge.description.startsWith('PAYMENT'))).toBe(
      false,
    );
  });
});
