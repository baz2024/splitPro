import { type Workbook as WorkbookType } from 'exceljs';

import { detectFormat, guessMapping } from './columns';
import { detectDelimiter, guardFormula, parseCsv, toCsv, unguardFormula } from './csv';
import { guessDateFormat, parseDateCell } from './dates';
import { decimalToMinor, minorToDecimal } from './decimal';
import { type ExportExpense, buildCsv, summariseRows, toExportRow, yourShare } from './exportRows';
import { columnsGuessFrom } from './inspect';
import { categoryLabel, getExportLabels, resolveCategory } from './labels';
import { findDuplicates, normaliseRows } from './normalise';
import { buildParticipants } from './participants';
import { buildXlsx, cellToText, isSafeZip, readXlsx } from './xlsx';

const user = (id: number, name: string) => ({ id, name, email: `${name.toLowerCase()}@x.test` });

const expense = (overrides: Partial<ExportExpense> = {}): ExportExpense => ({
  id: '0b8a3c1e-2f4d-4c6a-9e7b-1a2b3c4d5e6f',
  name: 'Vercel Pro',
  category: 'cloudHosting',
  amount: 2000n,
  currency: 'USD',
  splitType: 'EQUAL',
  expenseDate: new Date('2026-10-05T12:00:00Z'),
  needsReview: false,
  paidBy: 1,
  paidByUser: user(1, 'Basel'),
  group: { name: 'Safi' },
  expenseParticipants: [
    { userId: 1, amount: 1000n, user: user(1, 'Basel') },
    { userId: 2, amount: -1000n, user: user(2, 'Lina') },
  ],
  expenseNotes: [{ note: 'Team plan' }],
  recurrence: { job: { schedule: '0 0 5 * *' } },
  ...overrides,
});

describe('parseCsv', () => {
  it('handles BOM, quotes, escaped quotes and embedded newlines', () => {
    const rows = parseCsv('\ufeffa,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('Date;Amount;Note\n1;2;3')).toBe(';');
    expect(detectDelimiter('Date\tAmount\n1\t2')).toBe('\t');
    expect(detectDelimiter('"a;b",c,d\n')).toBe(',');
    expect(parseCsv('Date;Amount\n01/02/2026;12,50')).toEqual([
      ['Date', 'Amount'],
      ['01/02/2026', '12,50'],
    ]);
  });

  it('drops blank lines, keeps empty cells and handles CR-only endings', () => {
    expect(parseCsv('a,b\r\r\n,2\r3,\r')).toEqual([
      ['a', 'b'],
      ['', '2'],
      ['3', ''],
    ]);
  });

  it('ignores spaces around quoted fields and keeps an unterminated quote', () => {
    expect(parseCsv('a, "b" ,c\n"open,end')).toEqual([['a', 'b', 'c'], ['open,end']]);
  });

  it('parses Arabic text', () => {
    expect(parseCsv('التاريخ,الوصف\n2026-01-02,"قهوة، حليب"')).toEqual([
      ['التاريخ', 'الوصف'],
      ['2026-01-02', 'قهوة، حليب'],
    ]);
  });
});

describe('formula injection guard', () => {
  it.each(['=SUM(A1)', '+1', '-2+3', '@cmd', '\tx', '\rx'])('prefixes %j', (value) => {
    expect(guardFormula(value)).toBe(`'${value}`);
    expect(unguardFormula(guardFormula(value))).toBe(value);
  });

  it('leaves safe text alone', () => {
    expect(guardFormula('Coffee = good')).toBe('Coffee = good');
    expect(unguardFormula("'quoted")).toBe("'quoted");
  });

  it('guards text cells in toCsv but not numeric cells', () => {
    const csv = toCsv([['=HYPERLINK("x")', { numeric: '-12.50' }, { numeric: '=1' }]]);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toBe('\ufeff"\'=HYPERLINK(""x"")",-12.50,\'=1\r\n');
  });
});

describe('decimal ↔ BigInt', () => {
  it('formats minor units exactly', () => {
    expect(minorToDecimal(123456789012345678n, 2)).toBe('1234567890123456.78');
    expect(minorToDecimal(-5n, 2)).toBe('-0.05');
    expect(minorToDecimal(1500n, 0)).toBe('1500');
    expect(minorToDecimal(1234n, 3)).toBe('1.234');
  });

  it.each([
    ['12.34', 2, 1234n],
    ['1,234.56', 2, 123456n],
    ['1.234,56', 2, 123456n],
    ['1 234,56', 2, 123456n],
    ['1,234', 2, 123400n],
    ['12,5', 2, 1250n],
    ['$12', 2, 1200n],
    ['12.30 USD', 2, 1230n],
    ['(15.00)', 2, -1500n],
    ['-7.5', 2, -750n],
    ['7.5-', 2, -750n],
    ['١٢٫٥٠', 2, 1250n],
    ['د.ا 5.250', 3, 5250n],
    ['1.234', 0, 1234n],
    ['12.500', 2, 1250n],
    ['1,234,567.89', 2, 123456789n],
  ])('parses %j with %i digits', (raw, digits, expected) => {
    expect(decimalToMinor(raw, digits)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['12.345', 2, 'too_many_decimals'],
    ['abc', 2, 'invalid_amount'],
    ['1e5', 2, 'invalid_amount'],
    ['1.2.3', 2, 'invalid_amount'],
    ['', 2, 'invalid_amount'],
  ])('rejects %j', (raw, digits, error) => {
    expect(decimalToMinor(raw, digits)).toEqual({ ok: false, error });
  });

  it('round-trips without floats', () => {
    [0n, 1n, 99n, 100n, 987654321987654n].forEach((value) => {
      expect(decimalToMinor(minorToDecimal(value, 2), 2)).toEqual({ ok: true, value });
    });
  });
});

describe('dates', () => {
  it('reads ISO regardless of chosen order', () => {
    expect(parseDateCell('2026-11-01', 'MDY')).toEqual({ year: 2026, month: 11, day: 1 });
    expect(parseDateCell('2026-11-01T23:10:00Z', 'DMY')).toEqual({ year: 2026, month: 11, day: 1 });
  });

  it('applies DMY / MDY and rejects impossible dates', () => {
    expect(parseDateCell('03/04/2026', 'DMY')).toEqual({ year: 2026, month: 4, day: 3 });
    expect(parseDateCell('03/04/2026', 'MDY')).toEqual({ year: 2026, month: 3, day: 4 });
    expect(parseDateCell('31/02/2026', 'DMY')).toBeNull();
    expect(parseDateCell('1 Nov 2026', 'DMY')).toEqual({ year: 2026, month: 11, day: 1 });
  });

  it('guesses the order from samples', () => {
    expect(guessDateFormat(['2026-01-02', '2026-03-04'])).toBe('ISO');
    expect(guessDateFormat(['01/13/2026', '02/01/2026'])).toBe('MDY');
    expect(guessDateFormat(['13/01/2026'])).toBe('DMY');
  });
});

describe('header auto-mapping', () => {
  it('maps English bank headers', () => {
    expect(
      guessMapping(['Transaction Date', 'Details', 'Amount', 'Currency', 'Category']),
    ).toMatchObject({ date: 0, description: 1, amount: 2, currency: 3, category: 4 });
  });

  it('maps Arabic headers, including spelling variants', () => {
    expect(guessMapping(['التاريخ', 'البيان', 'القيمة', 'العملة', 'ملاحظات'])).toMatchObject({
      date: 0,
      description: 1,
      amount: 2,
      currency: 3,
      notes: 4,
    });
  });

  it('keeps "Category key" apart from "Category" and detects formats', () => {
    const labels = getExportLabels('en');
    const headers = Object.values(labels.columns);
    const mapping = guessMapping(headers);
    expect(headers[mapping.category ?? -1]).toBe('Category');
    expect(headers[mapping.categoryKey ?? -1]).toBe('Category key');
    expect(headers[mapping.expenseId ?? -1]).toBe('Expense ID');
    expect(detectFormat(headers)).toBe('safi');
    expect(detectFormat(Object.values(getExportLabels('ar').columns))).toBe('safi');
    expect(detectFormat(['Date', 'Description', 'Category', 'Cost', 'Currency', 'Lina'])).toBe(
      'splitwise',
    );
    expect(detectFormat(['Date', 'Amount'])).toBe('generic');
  });

  it('leaves unknown columns unmapped', () => {
    expect(guessMapping(['Foo', 'Bar'])).toMatchObject({ date: null, amount: null });
  });
});

describe('categories', () => {
  it('maps by key, English/Arabic label, service name, else general', () => {
    expect(resolveCategory({ key: 'groceries' })).toBe('groceries');
    expect(resolveCategory({ label: 'Dining out' })).toBe('diningOut');
    expect(resolveCategory({ label: categoryLabel('groceries', 'ar') })).toBe('groceries');
    expect(resolveCategory({ label: 'Food & Drinks' })).toBe('food');
    expect(resolveCategory({ description: 'Supabase Pro plan' })).toBe('databases');
    expect(resolveCategory({ label: 'Misc stuff', description: 'Lunch' })).toBe('general');
  });
});

describe('participants', () => {
  it('splits equally with exact remainders and sums to zero', () => {
    const participants = buildParticipants({
      amount: 1000n,
      payerId: 1,
      memberIds: [3, 1, 2],
      mode: 'equal',
    });
    expect(participants).toEqual([
      { userId: 1, amount: 667n },
      { userId: 2, amount: -334n },
      { userId: 3, amount: -333n },
    ]);
    expect(participants.reduce((sum, p) => sum + p.amount, 0n)).toBe(0n);
  });

  it('keeps personal and only-me imports balance-neutral', () => {
    expect(
      buildParticipants({ amount: 500n, payerId: 1, memberIds: [1], mode: 'personal' }),
    ).toEqual([{ userId: 1, amount: 500n }]);
    expect(buildParticipants({ amount: 500n, payerId: 1, memberIds: [1, 2], mode: 'me' })).toEqual([
      { userId: 1, amount: 0n },
    ]);
  });
});

const table = (headers: string[], rows: string[][]) => ({ headers, rows });

const baseOptions = {
  format: 'generic' as const,
  dateFormat: 'DMY' as const,
  defaultCurrency: 'USD',
  amountSign: 'positive' as const,
};

describe('normaliseRows', () => {
  it('validates rows and reports reasons', () => {
    const parsed = table(
      ['Date', 'Description', 'Amount'],
      [
        ['01/02/2026', 'Coffee', '3.50'],
        ['', 'No date', '1'],
        ['31/02/2026', 'Bad date', '1'],
        ['01/02/2026', '', '1'],
        ['01/02/2026', 'Refund', '-4'],
        ['01/02/2026', 'Zero', '0'],
        ['01/02/2026', 'Precise', '1.234'],
      ],
    );
    const rows = normaliseRows(parsed, { ...baseOptions, mapping: guessMapping(parsed.headers) });
    expect(rows.map((row) => [row.errors, row.skip])).toEqual([
      [[], null],
      [['missing_date'], null],
      [['invalid_date'], null],
      [['missing_description'], null],
      [[], 'refund'],
      [['zero_amount'], null],
      [['too_many_decimals'], null],
    ]);
    expect(rows[0]).toMatchObject({ amountMinor: 350n, currency: 'USD', line: 2 });
  });

  it('treats negative bank amounts as spending and credits as income', () => {
    const parsed = table(
      ['Date', 'Payee', 'Amount'],
      [
        ['2026-01-02', 'Shop', '-12.00'],
        ['2026-01-03', 'Salary', '1000'],
      ],
    );
    expect(columnsGuessFrom(table(parsed.headers, [parsed.rows[0]!])).amountSign).toBe('negative');
    const rows = normaliseRows(parsed, {
      ...baseOptions,
      amountSign: 'negative',
      mapping: guessMapping(parsed.headers),
    });
    expect(rows[0]).toMatchObject({ amountMinor: 1200n, skip: null });
    expect(rows[1]?.skip).toBe('income');
  });

  it('skips Splitwise payments and the totals row', () => {
    const parsed = table(
      ['Date', 'Description', 'Category', 'Cost', 'Currency', 'Lina'],
      [
        ['2026-01-02', 'Dinner', 'Dining out', '40.00', 'EUR', '-20.00'],
        ['2026-01-03', 'Lina paid Basel', 'Payment', '20.00', 'EUR', '20.00'],
        ['', 'Total balance', '', '', 'EUR', '0.00'],
      ],
    );
    const rows = normaliseRows(parsed, {
      ...baseOptions,
      format: 'splitwise',
      mapping: guessMapping(parsed.headers),
    });
    expect(rows[0]).toMatchObject({ amountMinor: 4000n, currency: 'EUR', category: 'diningOut' });
    expect(rows[1]?.skip).toBe('settlement');
    expect(rows[2]?.skip).toBe('summary_row');
  });
});

describe('duplicate detection', () => {
  const parsed = table(
    ['Date', 'Description', 'Amount', 'Expense ID'],
    [
      ['2026-03-01', 'Vercel Pro ', '20.00', ''],
      ['2026-03-01', 'Vercel Pro', '20.00', '0b8a3c1e-2f4d-4c6a-9e7b-1a2b3c4d5e6f'],
      ['2026-03-02', 'Vercel Pro', '20.00', ''],
      ['2026-03-01', 'Vercel Pro', '25.00', ''],
    ],
  );
  const rows = normaliseRows(parsed, {
    ...baseOptions,
    dateFormat: 'ISO',
    mapping: guessMapping(parsed.headers),
  });

  it('matches by expense ID first, then by date + amount + description', () => {
    const duplicates = findDuplicates(rows, [
      {
        id: '0B8A3C1E-2F4D-4C6A-9E7B-1A2B3C4D5E6F',
        date: { year: 2026, month: 3, day: 9 },
        amount: 1n,
        currency: 'USD',
        name: 'Other',
      },
      {
        id: 'ffffffff-2f4d-4c6a-9e7b-1a2b3c4d5e6f',
        date: { year: 2026, month: 3, day: 1 },
        amount: 2000n,
        currency: 'USD',
        name: 'vercel pro',
      },
    ]);
    expect([...duplicates.entries()]).toEqual([
      [0, 'duplicate_details'],
      [1, 'duplicate_id'],
    ]);
  });
});

describe('export rows', () => {
  const labels = getExportLabels('en');

  it('computes your share from double-entry participants', () => {
    expect(yourShare(expense(), 1)).toBe(1000n);
    expect(yourShare(expense(), 2)).toBe(1000n);
    expect(yourShare(expense(), 9)).toBe(0n);
    expect(
      yourShare(
        expense({ expenseParticipants: [{ userId: 1, amount: 2000n, user: user(1, 'Basel') }] }),
        1,
      ),
    ).toBe(2000n);
  });

  it('builds localised rows and summaries', () => {
    const row = toExportRow(expense(), { userId: 1, labels, timeZone: 'UTC' });
    expect(row).toMatchObject({
      category: 'Cloud & hosting',
      categoryKey: 'cloudHosting',
      paidBy: 'You',
      participants: 'You; Lina',
      recurring: 'Monthly',
      notes: 'Team plan',
      needsReview: 'No',
    });
    const arabic = toExportRow(expense(), {
      userId: 1,
      labels: getExportLabels('ar'),
      timeZone: 'UTC',
    });
    expect(arabic.recurring).toBe('شهري');
    const summary = summariseRows([row, { ...row, amountMinor: 500n, yourShareMinor: 500n }]);
    expect(summary.byCurrency).toEqual([
      { currency: 'USD', count: 2, totalMinor: 2500n, yourShareMinor: 1500n },
    ]);
  });

  it('uses the viewer time zone for the calendar date', () => {
    const late = expense({ expenseDate: new Date('2026-10-05T22:30:00Z') });
    expect(toExportRow(late, { userId: 1, labels, timeZone: 'Asia/Amman' }).date).toEqual({
      year: 2026,
      month: 10,
      day: 6,
    });
  });
});

describe('round trip', () => {
  it.each(['en', 'ar'] as const)('re-imports a %s CSV export with the same values', (locale) => {
    const labels = getExportLabels(locale);
    const source = [
      expense(),
      expense({
        id: '1c9d4e2f-3a5b-4d7c-8f9a-2b3c4d5e6f70',
        name: '=cmd|"/c calc"!A1, with "quotes"',
        category: 'groceries',
        amount: 123456n,
        currency: 'JOD',
        expenseNotes: [],
        needsReview: true,
        recurrence: null,
      }),
    ];
    const rows = source.map((item) => toExportRow(item, { userId: 1, labels, timeZone: 'UTC' }));
    const parsed = parseCsv(buildCsv(rows, labels));
    const [headers = [], ...body] = parsed;
    expect(detectFormat(headers)).toBe('safi');
    const imported = normaliseRows(
      { headers, rows: body },
      { ...baseOptions, format: 'safi', dateFormat: 'ISO', mapping: guessMapping(headers) },
    );
    expect(
      imported.map((row) => ({
        date: row.date,
        description: row.description,
        amount: row.amountMinor,
        currency: row.currency,
        category: row.category,
        notes: row.notes,
        needsReview: row.needsReview,
        expenseId: row.expenseId,
        errors: row.errors,
      })),
    ).toEqual([
      {
        date: { year: 2026, month: 10, day: 5 },
        description: 'Vercel Pro',
        amount: 2000n,
        currency: 'USD',
        category: 'cloudHosting',
        notes: 'Team plan',
        needsReview: false,
        expenseId: '0b8a3c1e-2f4d-4c6a-9e7b-1a2b3c4d5e6f',
        errors: [],
      },
      {
        date: { year: 2026, month: 10, day: 5 },
        description: '=cmd|"/c calc"!A1, with "quotes"',
        amount: 123456n,
        currency: 'JOD',
        category: 'groceries',
        notes: null,
        needsReview: true,
        expenseId: '1c9d4e2f-3a5b-4d7c-8f9a-2b3c4d5e6f70',
        errors: [],
      },
    ]);
  });
});

describe('xlsx', () => {
  it('builds a workbook with typed cells and reads it back', async () => {
    const labels = getExportLabels('en');
    const rows = [expense()].map((item) =>
      toExportRow(item, { userId: 1, labels, timeZone: 'UTC' }),
    );
    const buffer = await buildXlsx(rows, labels);
    expect(isSafeZip(buffer)).toBe(true);

    type WorkbookConstructor = new () => WorkbookType;
    const ExcelJS: {
      Workbook?: WorkbookConstructor;
      default?: { Workbook?: WorkbookConstructor };
    } = await import('exceljs');
    const Workbook = ExcelJS.default?.Workbook ?? ExcelJS.Workbook;
    expect(Workbook).toBeDefined();
    const workbook = new Workbook!();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Expenses', 'Summary']);
    const sheet = workbook.getWorksheet('Expenses')!;
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getCell('A2').value).toBeInstanceOf(Date);
    expect(sheet.getCell('E2').value).toBe(20);
    expect(sheet.getCell('E2').numFmt).toBe('#,##0.00');
    expect(sheet.getColumn(2).width).toBe(36);

    const readBack = await readXlsx(buffer);
    expect(readBack.headers[0]).toBe('Date');
    expect(readBack.rows[0]?.slice(0, 6)).toEqual([
      '2026-10-05',
      'Vercel Pro',
      'Cloud & hosting',
      'cloudHosting',
      '20',
      'USD',
    ]);
  });

  it('rejects non-zip input and cleans float noise', () => {
    expect(isSafeZip(Buffer.from('not a zip'))).toBe(false);
    expect(cellToText(0.1 + 0.2)).toBe('0.3');
    expect(cellToText(new Date(Date.UTC(2026, 0, 2)))).toBe('2026-01-02');
    expect(cellToText({ formula: 'A1', result: 5 })).toBe('5');
  });
});
