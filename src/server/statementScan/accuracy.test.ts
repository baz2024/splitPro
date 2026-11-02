/**
 * End-to-end accuracy on synthetic but realistic exports: the real dataio pipeline
 * (parseCsv → column guess → normaliseRows) feeds importRowsToCharges → detectSubscriptions.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCsv } from '../dataio/csv';
import { normaliseRows } from '../dataio/normalise';

import { importRowsToCharges } from './charges';
import { detectSubscriptions } from './detect';
import { detectInvoiceExport, invoiceRowsToCharges } from './invoiceExport';
import { prepareStatementTable } from './statementColumns';
import { type ScanCadence, type ScanFlag, type ScanReport, type StatementCharge } from './types';

const TODAY = { year: 2026, month: 11, day: 2 };

interface Planted {
  /** Vendor id, or the normalised name for unknown merchants. */
  key: string;
  name: string;
  cadence: ScanCadence | null;
  flags: ScanFlag[];
  via?: string;
}

const readTable = (name: string) => {
  const [headers = [], ...rows] = parseCsv(
    readFileSync(join(__dirname, 'fixtures', `${name}.csv`), 'utf8'),
  );
  return { headers, rows };
};

const statementCharges = (name: string): StatementCharge[] => {
  const prepared = prepareStatementTable(readTable(name));
  const rows = normaliseRows(prepared.table, {
    format: 'generic',
    mapping: prepared.mapping,
    dateFormat: prepared.dateFormat,
    defaultCurrency: prepared.currency ?? 'EUR',
    amountSign: prepared.amountSign,
  });
  return importRowsToCharges(rows);
};

const invoiceCharges = (name: string): StatementCharge[] => {
  const table = readTable(name);
  const layout = detectInvoiceExport(table.headers);
  if (!layout) {
    throw new Error(`${name} is not an invoice export`);
  }
  return invoiceRowsToCharges(table, layout, 'EUR');
};

const keyOf = (item: ScanReport['items'][number]) =>
  item.vendor.vendorId ?? item.fingerprint.split(':')[1] ?? '';

const NOISE =
  /tesco|lidl|uber|deliveroo|amazon|amzn|insomnia|circle k|leap|landlord|rent|atm|bunsen|wagamama|nandos|five guys|boojum|milano/i;

const BANK_PLANTED: Planted[] = [
  { key: 'github', name: 'GitHub', cadence: 'monthly', flags: [] },
  { key: 'vercel', name: 'Vercel', cadence: 'monthly', flags: ['price_rise'] },
  { key: 'chatgpt', name: 'ChatGPT', cadence: 'monthly', flags: [] },
  { key: 'chatgpt', name: 'ChatGPT', cadence: 'monthly', flags: ['duplicate'] },
  { key: 'notion', name: 'Notion', cadence: 'monthly', flags: [] },
  { key: 'google-workspace', name: 'Google Workspace', cadence: 'monthly', flags: [] },
  { key: 'apple', name: 'Apple (App Store / iCloud)', cadence: 'monthly', flags: [] },
  { key: 'raycast', name: 'Raycast', cadence: 'yearly', flags: [], via: 'paddle' },
];

const FIXTURES: { name: string; kind: 'statement' | 'invoice'; planted: Planted[] }[] = [
  {
    name: 'revolut',
    kind: 'statement',
    planted: [
      ...BANK_PLANTED,
      { key: 'figma', name: 'Figma', cadence: 'yearly', flags: ['annual_soon'] },
      { key: 'cursor', name: 'Cursor', cadence: null, flags: ['trial'] },
      { key: 'flyefit', name: 'Flyefit', cadence: 'monthly', flags: [] },
    ],
  },
  {
    name: 'aib',
    kind: 'statement',
    planted: [
      ...BANK_PLANTED,
      { key: 'figma', name: 'Figma', cadence: 'yearly', flags: ['annual_soon'] },
      { key: 'cursor', name: 'Cursor', cadence: null, flags: ['trial'] },
      { key: 'flyefit', name: 'Flyefit', cadence: 'monthly', flags: [] },
    ],
  },
  {
    name: 'amex',
    kind: 'statement',
    planted: [
      ...BANK_PLANTED,
      { key: 'figma', name: 'Figma', cadence: 'yearly', flags: ['annual_soon'] },
      { key: 'cursor', name: 'Cursor', cadence: null, flags: ['trial'] },
    ],
  },
  {
    name: 'stripe-invoices',
    kind: 'invoice',
    planted: [
      { key: 'supabase', name: 'Supabase', cadence: 'monthly', flags: ['price_rise'] },
      { key: 'retool', name: 'Retool', cadence: 'yearly', flags: ['annual_soon'] },
    ],
  },
  {
    name: 'github-usage',
    kind: 'invoice',
    planted: [
      { key: 'github-copilot', name: 'GitHub Copilot', cadence: 'monthly', flags: [] },
      { key: 'github', name: 'GitHub', cadence: 'monthly', flags: [] },
    ],
  },
];

const signature = ({ key, name, cadence, flags }: Planted) =>
  `${key}|${name}|${cadence ?? 'trial'}|${[...flags].sort().join(',')}`;

describe('statement scan accuracy', () => {
  describe.each(FIXTURES)('$name', ({ name, kind, planted }) => {
    const charges = 'statement' === kind ? statementCharges(name) : invoiceCharges(name);
    const report = detectSubscriptions(charges, { today: TODAY });
    const found = report.items.map((item) =>
      signature({
        key: keyOf(item),
        name: item.vendor.name,
        cadence: item.cadence,
        flags: item.flags,
      }),
    );

    it('should read a realistic number of rows', () => {
      expect(charges.length).toBeGreaterThan('statement' === kind ? 150 : 5);
    });

    it('should find every planted subscription with the right vendor, cadence and flags', () => {
      expect([...found].sort()).toEqual(planted.map(signature).sort());
    });

    it('should record the reseller', () => {
      planted
        .filter((entry) => entry.via)
        .forEach((entry) => {
          const item = report.items.find((candidate) => keyOf(candidate) === entry.key);
          expect(item?.vendor.via).toBe(entry.via);
        });
    });

    it('should leave out the stopped Linear plan and everyday spending', () => {
      expect(report.items.some((item) => 'linear' === item.vendor.vendorId)).toBe(false);
      expect(report.items.filter((item) => NOISE.test(item.vendor.name))).toEqual([]);
      expect(report.ignoredRows).toBeGreaterThan('statement' === kind ? 100 : -1);
    });

    it('should point duplicates at the main stream', () => {
      report.items
        .filter((item) => item.flags.includes('duplicate'))
        .forEach((item) => {
          expect(report.items.some((main) => main.fingerprint === item.duplicateOf)).toBe(true);
        });
    });
  });

  it('should price the price rise and the duplicate on Revolut', () => {
    const report = detectSubscriptions(statementCharges('revolut'), { today: TODAY });
    const vercel = report.items.find((item) => 'vercel' === item.vendor.vendorId);
    expect(vercel).toMatchObject({
      amountMinor: 2037n,
      previousAmountMinor: 1852n,
      atRiskYearlyMinor: (2037n - 1852n) * 12n,
    });
    const figma = report.items.find((item) => 'figma' === item.vendor.vendorId);
    expect(figma?.nextRenewal).toEqual({ year: 2026, month: 12, day: 14 });
    const cursor = report.items.find((item) => 'cursor' === item.vendor.vendorId);
    expect(cursor?.nextRenewal).toEqual({ year: 2026, month: 11, day: 10 });
    expect(report.totals).toHaveLength(1);
    expect(report.totals[0]?.counts).toEqual({
      trial: 1,
      duplicate: 1,
      price_rise: 1,
      annual_soon: 1,
    });
  });
});
