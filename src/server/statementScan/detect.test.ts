import { type CalendarDate } from '../dataio/dates';

import { detectSubscriptions } from './detect';
import { type ScanItem, type StatementCharge } from './types';

const TODAY: CalendarDate = { year: 2026, month: 11, day: 2 };

const parse = (iso: string): CalendarDate => {
  const [year = 0, month = 0, day = 0] = iso.split('-').map(Number);
  return { year, month, day };
};

const iso = ({ year, month, day }: CalendarDate) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

let nextLine = 2;
const charge = (
  date: string,
  description: string,
  amountMinor: bigint,
  currency = 'EUR',
  extra: Partial<StatementCharge> = {},
): StatementCharge => {
  nextLine += 1;
  return { line: nextLine, date: parse(date), description, amountMinor, currency, ...extra };
};

/** One charge per month on `day`, from `start` (YYYY-MM) for `count` months. */
const monthly = (
  start: string,
  count: number,
  day: number,
  description: string,
  amount: bigint | ((index: number) => bigint),
  currency = 'EUR',
) => {
  const [year = 0, month = 0] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const total = year * 12 + month - 1 + index;
    const date = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return charge(date, description, 'bigint' === typeof amount ? amount : amount(index), currency);
  });
};

/** `count` charges `step` days apart from `start`. */
const every = (
  start: string,
  count: number,
  step: number,
  description: string,
  amount: (index: number) => bigint,
) => {
  const { year, month, day } = parse(start);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index * step));
    return charge(
      iso({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }),
      description,
      amount(index),
    );
  });
};

const detect = (charges: StatementCharge[]) => detectSubscriptions(charges, { today: TODAY });

const only = (items: ScanItem[], vendorId: string) =>
  items.filter((item) => item.vendor.vendorId === vendorId);

/** Pseudo-random but deterministic amounts for noise. */
const noiseAmount = (index: number) => BigInt(800 + ((index * 7919) % 8700));

describe('detectSubscriptions', () => {
  describe('Cadence', () => {
    it('should find a monthly known vendor with high confidence and the next renewal', () => {
      const report = detect(monthly('2026-05', 6, 7, 'GITHUB, INC.', 400n));
      expect(report.items).toHaveLength(1);
      const [item] = report.items;
      expect(item).toMatchObject({
        fingerprint: 'statement:github:EUR:monthly',
        cadence: 'monthly',
        amountMinor: 400n,
        chargeCount: 6,
        yearlyMinor: 4800n,
        atRiskYearlyMinor: 0n,
        flags: [],
        confidence: 'high',
        source: 'statement',
      });
      expect(iso(item?.firstSeen ?? TODAY)).toBe('2026-05-07');
      expect(iso(item?.nextRenewal ?? TODAY)).toBe('2026-11-07');
    });

    it('should find a weekly cadence', () => {
      const charges = every('2026-09-07', 8, 7, 'ZOOM.US 888-799-9666', () => 1500n);
      const [item] = detect(charges).items;
      expect(item?.cadence).toBe('weekly');
      expect(item?.yearlyMinor).toBe(1500n * 52n);
    });

    it('should find a yearly plan from two charges a year apart', () => {
      const report = detect([
        charge('2024-12-01', 'JETBRAINS', 24900n),
        charge('2025-12-01', 'JETBRAINS', 24900n),
      ]);
      expect(report.items[0]).toMatchObject({ cadence: 'yearly', chargeCount: 2 });
      expect(iso(report.items[0]?.nextRenewal ?? TODAY)).toBe('2026-12-01');
    });

    it('should tolerate one missed month', () => {
      const charges = monthly('2026-03', 8, 10, 'NOTION LABS, INC.', 950n).filter(
        (_, index) => 3 !== index,
      );
      const [item] = detect(charges).items;
      expect(item).toMatchObject({ cadence: 'monthly', chargeCount: 7, confidence: 'high' });
    });

    it('should roll the next renewal forward when the statement is old', () => {
      const charges = monthly('2026-01', 4, 15, 'VERCEL INC.', 2000n);
      // Statement ends in April; something else was charged later, so the stream is stale.
      const stale = detect([...charges, charge('2026-10-01', 'Tesco', 1234n)]);
      expect(only(stale.items, 'vercel')).toHaveLength(0);
      // On its own the statement ends in April: the stream is live and renews after today.
      const [item] = detect(charges).items;
      expect(iso(item?.nextRenewal ?? TODAY)).toBe('2026-11-15');
    });
  });

  describe('Stopped subscriptions', () => {
    it('should drop a monthly stream that stopped more than two cycles before the end', () => {
      const report = detect([
        ...monthly('2025-11', 8, 12, 'Linear.app', 800n),
        ...monthly('2025-11', 12, 7, 'GITHUB, INC.', 400n),
      ]);
      expect(only(report.items, 'linear')).toHaveLength(0);
      expect(only(report.items, 'github')).toHaveLength(1);
    });

    it('should keep a yearly plan within a year of the statement end', () => {
      const report = detect([
        charge('2025-12-14', 'FIGMA', 14400n),
        ...monthly('2025-11', 12, 7, 'GITHUB, INC.', 400n),
      ]);
      expect(only(report.items, 'figma')).toHaveLength(1);
    });
  });

  describe('Single yearly charge', () => {
    it('should read a lone large charge from a known vendor as yearly', () => {
      const [item] = detect([charge('2026-03-10', 'PADDLE.NET* RAYCAST', 9600n)]).items;
      expect(item).toMatchObject({
        cadence: 'yearly',
        confidence: 'medium',
        vendor: { vendorId: 'raycast', via: 'paddle', name: 'Raycast' },
      });
      expect(iso(item?.nextRenewal ?? TODAY)).toBe('2027-03-10');
    });

    it('should ignore a lone ordinary charge', () => {
      expect(detect([charge('2026-03-10', 'PADDLE.NET* RAYCAST', 800n)]).items).toHaveLength(0);
      expect(detect([charge('2026-03-10', 'Some Shop', 50000n)]).items).toHaveLength(0);
    });
  });

  describe('price_rise', () => {
    it('should flag a persisted rise above 5% and count only the increase', () => {
      const charges = monthly('2026-01', 10, 15, 'VERCEL INC.', (index) =>
        6 > index ? 2000n : 2400n,
      );
      const [item] = detect(charges).items;
      expect(item?.flags).toEqual(['price_rise']);
      expect(item?.previousAmountMinor).toBe(2000n);
      expect(item?.amountMinor).toBe(2400n);
      expect(item?.atRiskYearlyMinor).toBe(400n * 12n);
    });

    it('should flag a rise on the latest charge', () => {
      const charges = monthly('2026-04', 7, 15, 'NOTION LABS', (index) =>
        6 > index ? 1000n : 1200n,
      );
      expect(detect(charges).items[0]?.flags).toEqual(['price_rise']);
    });

    it('should not flag small changes or price drops', () => {
      const small = monthly('2026-01', 10, 15, 'VERCEL INC.', (index) =>
        6 > index ? 2000n : 2060n,
      );
      expect(detect(small).items[0]?.flags).toEqual([]);
      const drop = monthly('2026-01', 10, 15, 'VERCEL INC.', (index) =>
        6 > index ? 2400n : 2000n,
      );
      expect(detect(drop).items[0]?.flags).toEqual([]);
      expect(detect(drop).items[0]?.previousAmountMinor).toBeNull();
    });
  });

  describe('duplicate', () => {
    it('should split two interleaved amounts into a main stream and a duplicate', () => {
      const report = detect([
        ...monthly('2026-03', 8, 5, 'OPENAI *CHATGPT SUBSCR', 1860n),
        ...monthly('2026-05', 6, 21, 'OPENAI *CHATGPT', 2306n),
      ]);
      const items = only(report.items, 'chatgpt');
      expect(items).toHaveLength(2);
      const duplicate = items.find((item) => item.flags.includes('duplicate'));
      const main = items.find((item) => !item.flags.includes('duplicate'));
      expect(main?.fingerprint).toBe('statement:chatgpt:EUR:monthly');
      expect(duplicate).toMatchObject({
        fingerprint: 'statement:chatgpt:EUR:monthly:2',
        duplicateOf: 'statement:chatgpt:EUR:monthly',
        amountMinor: 2306n,
        atRiskYearlyMinor: 2306n * 12n,
      });
      expect(main?.atRiskYearlyMinor).toBe(0n);
    });

    it('should split the same amount charged twice a month on different days', () => {
      const report = detect([
        ...monthly('2026-01', 10, 4, 'OpenAI *ChatGPT Subscr', 2145n),
        ...monthly('2026-04', 7, 19, 'OpenAI *ChatGPT Subscr', 2145n),
      ]);
      const items = only(report.items, 'chatgpt');
      expect(items.map((item) => item.chargeCount)).toEqual([7, 10]);
      expect(items.filter((item) => item.flags.includes('duplicate'))).toHaveLength(1);
      expect(report.totals[0]?.counts.duplicate).toBe(1);
    });

    it('should not invent duplicates for an unknown merchant charged often', () => {
      const coffee = every('2026-05-01', 40, 4, 'Insomnia Coffee', () => 420n);
      expect(detect(coffee).items).toHaveLength(0);
    });
  });

  describe('trial', () => {
    it('should report a recent card check from a vendor with trials', () => {
      const report = detect([
        charge('2026-10-27', 'CURSOR, AI POWERED IDE', 92n),
        ...monthly('2026-05', 6, 7, 'GITHUB, INC.', 400n),
      ]);
      const [item] = only(report.items, 'cursor');
      expect(item).toMatchObject({
        fingerprint: 'statement:cursor:EUR:trial',
        cadence: null,
        amountMinor: 0n,
        flags: ['trial'],
        chargeCount: 1,
      });
      expect(iso(item?.nextRenewal ?? TODAY)).toBe('2026-11-10');
    });

    it('should use the catalog price for USD trials', () => {
      const [item] = detect([charge('2026-10-30', 'CURSOR AI', 0n, 'USD')]).items;
      expect(item?.amountMinor).toBe(2000n);
      expect(item?.yearlyMinor).toBe(24000n);
      expect(item?.atRiskYearlyMinor).toBe(24000n);
      expect(item?.confidence).toBe('high');
    });

    it('should skip ended trials, converted trials and unknown merchants', () => {
      expect(detect([charge('2026-09-01', 'CURSOR AI', 0n)]).items).toHaveLength(0);
      expect(
        detect([charge('2026-10-15', 'CURSOR AI', 0n), charge('2026-10-29', 'CURSOR AI', 2000n)])
          .items,
      ).toHaveLength(0);
      expect(detect([charge('2026-10-27', 'Some Gym', 100n)]).items).toHaveLength(0);
      expect(detect([charge('2026-10-27', 'NOTION LABS', 0n)]).items).toHaveLength(0);
    });
  });

  describe('Tiny recurring plans', () => {
    it('should read a repeating tiny charge as a plan, not a card check', () => {
      const [item] = detect(monthly('2026-01', 10, 26, 'APPLE.COM/BILL', 99n)).items;
      expect(item).toMatchObject({ cadence: 'monthly', amountMinor: 99n, chargeCount: 10 });
      expect(item?.flags).toEqual([]);
    });

    it('should not report a trial for a vendor already on a tiny plan', () => {
      const report = detect(monthly('2026-05', 6, 25, 'BITWARDEN', 92n));
      expect(report.items.map((item) => item.cadence)).toEqual(['monthly']);
    });

    it('should not report a trial for an existing paying customer', () => {
      const report = detect([
        charge('2026-02-10', 'CURSOR AI', 2000n),
        charge('2026-10-27', 'CURSOR AI', 0n),
      ]);
      expect(report.items.filter((item) => item.flags.includes('trial'))).toEqual([]);
    });
  });

  describe('annual_soon', () => {
    it('should flag a yearly renewal within 60 days and count the whole year', () => {
      const [item] = detect([
        charge('2024-12-14', 'FIGMA', 14400n),
        charge('2025-12-14', 'FIGMA', 14400n),
      ]).items;
      expect(item?.flags).toEqual(['annual_soon']);
      expect(item?.atRiskYearlyMinor).toBe(14400n);
    });

    it('should not flag a yearly renewal further away', () => {
      const [item] = detect([
        charge('2025-03-10', 'JETBRAINS', 24900n),
        charge('2026-03-10', 'JETBRAINS', 24900n),
      ]).items;
      expect(item?.flags).toEqual([]);
      expect(item?.atRiskYearlyMinor).toBe(0n);
    });
  });

  describe('Unknown merchants', () => {
    it('should find a steady gym membership with medium confidence', () => {
      const [item] = detect(monthly('2026-01', 10, 3, 'FLYEFIT', 2499n)).items;
      expect(item).toMatchObject({
        fingerprint: 'statement:flyefit:EUR:monthly',
        vendor: { known: false, name: 'Flyefit', category: 'general' },
        confidence: 'medium',
      });
    });

    it('should follow one clean price step at an unknown merchant', () => {
      const charges = monthly('2026-01', 10, 3, 'FLYEFIT', (index) => (6 > index ? 2499n : 2799n));
      const [item] = detect(charges).items;
      expect(item).toMatchObject({ flags: ['price_rise'], previousAmountMinor: 2499n });
    });

    it('should not read three loosely similar bills as a subscription', () => {
      const similar = [
        charge('2026-08-10', 'The Bank On College Green', 2400n),
        charge('2026-09-10', 'The Bank On College Green', 2492n),
        charge('2026-10-10', 'The Bank On College Green', 2580n),
      ];
      const oneOutlier = monthly('2026-08', 3, 12, 'Pho Ta', (index) =>
        2 > index ? 2500n : 7000n,
      );
      expect(detect([...similar, ...oneOutlier]).items).toHaveLength(0);
    });

    it('should give a short unknown series low confidence', () => {
      const [item] = detect(monthly('2026-08', 3, 3, 'SOME CLUB', 1500n)).items;
      expect(item?.confidence).toBe('low');
    });

    it('should ignore groceries, rent and variable amounts', () => {
      const groceries = every('2026-04-01', 30, 6, 'Tesco', noiseAmount);
      const varying = monthly('2026-01', 10, 9, 'Uber *Trip', (index) => noiseAmount(index));
      const rent = monthly('2026-01', 10, 1, 'To Landlord Property Ltd', 165000n);
      const twoDifferent = [
        charge('2026-09-01', 'Bunsen', 2500n),
        charge('2026-10-01', 'Bunsen', 2700n),
      ];
      expect(detect([...groceries, ...varying, ...rent, ...twoDifferent]).items).toHaveLength(0);
    });

    it('should not let a few same-priced visits to a busy merchant count', () => {
      const visits = every('2026-04-02', 20, 9, 'Tesco', noiseAmount);
      const regular = monthly('2026-04', 3, 20, 'Tesco', 1999n);
      expect(detect([...visits, ...regular]).items).toHaveLength(0);
    });
  });

  describe('Totals and ordering', () => {
    const charges = [
      ...monthly('2025-11', 12, 7, 'GITHUB, INC.', 400n),
      ...monthly('2025-11', 12, 15, 'VERCEL INC.', (index) => (7 > index ? 1852n : 2037n)),
      ...monthly('2026-01', 10, 4, 'OpenAI *ChatGPT Subscr', 2145n),
      ...monthly('2026-04', 7, 19, 'OpenAI *ChatGPT Subscr', 2145n),
      charge('2025-12-14', 'FIGMA', 14400n),
      charge('2026-10-27', 'CURSOR AI', 0n),
      ...monthly('2026-01', 10, 1, 'AWS EMEA', 1500n, 'USD'),
    ];

    it('should order flagged items first: trial, annual_soon, duplicate, price_rise', () => {
      const report = detect(charges);
      expect(report.items.map((item) => item.flags[0] ?? 'none')).toEqual([
        'trial',
        'annual_soon',
        'duplicate',
        'price_rise',
        'none',
        'none',
        'none',
      ]);
      // Unflagged items: biggest yearly first.
      expect(report.items.slice(4).map((item) => item.vendor.vendorId)).toEqual([
        'chatgpt',
        'aws',
        'github',
      ]);
    });

    it('should total per currency, biggest at-risk first', () => {
      const report = detect(charges);
      expect(report.totals.map((total) => total.currency)).toEqual(['EUR', 'USD']);
      const [eur, usd] = report.totals;
      expect(eur).toMatchObject({
        subscriptions: 6,
        counts: { trial: 1, annual_soon: 1, duplicate: 1, price_rise: 1 },
        atRiskYearlyMinor: 14400n + 2145n * 12n + (2037n - 1852n) * 12n,
      });
      expect(usd).toMatchObject({ subscriptions: 1, yearlyMinor: 18000n, atRiskYearlyMinor: 0n });
      expect(report.from).toEqual({ year: 2025, month: 11, day: 7 });
      expect(report.to).toEqual({ year: 2026, month: 10, day: 27 });
      expect(report.scannedRows).toBe(charges.length);
    });

    it('should show the reseller of the latest charge', () => {
      const report = detect([
        charge('2026-09-10', 'RAYCAST', 800n),
        charge('2026-10-10', 'PADDLE.NET* RAYCAST', 800n),
      ]);
      expect(report.items[0]?.vendor.via).toBe('paddle');
    });

    it('should be deterministic regardless of input order', () => {
      const shuffled = [...charges].sort((a, b) => ((a.line * 7) % 13) - ((b.line * 7) % 13));
      expect(detect(shuffled)).toEqual(detect(charges));
    });

    it('should handle an empty statement', () => {
      expect(detect([])).toEqual({
        source: 'statement',
        items: [],
        totals: [],
        scannedRows: 0,
        ignoredRows: 0,
        from: null,
        to: null,
      });
    });
  });

  describe('Invoice exports', () => {
    const invoice = (start: string, end: string, description: string, amount: bigint) =>
      charge(start, description, amount, 'USD', {
        periodStart: parse(start),
        periodEnd: parse(end),
        vendorHint: 'unknown',
      });

    it('should take the cadence and next renewal from billing periods', () => {
      const report = detect([
        invoice('2026-08-01', '2026-09-01', 'Supabase Pro Plan', 2500n),
        invoice('2026-09-01', '2026-10-01', 'Supabase Pro Plan', 2500n),
        invoice('2026-10-01', '2026-11-01', 'Supabase Pro Plan', 2500n),
        invoice('2025-12-05', '2026-12-05', 'Retool Team (annual)', 120000n),
      ]);
      expect(report.source).toBe('invoice_export');
      const supabase = only(report.items, 'supabase')[0];
      expect(supabase).toMatchObject({
        cadence: 'monthly',
        source: 'invoice_export',
        confidence: 'high',
      });
      expect(iso(supabase?.firstSeen ?? TODAY)).toBe('2026-08-01');
      const retool = only(report.items, 'retool')[0];
      expect(retool).toMatchObject({ cadence: 'yearly', flags: ['annual_soon'] });
      expect(iso(retool?.nextRenewal ?? TODAY)).toBe('2026-12-05');
    });

    it('should add up line items of the same billing period', () => {
      const report = detect([
        charge('2026-09-30', 'GitHub Actions', 300n, 'USD', {
          periodStart: parse('2026-09-01'),
          periodEnd: parse('2026-09-30'),
          vendorHint: 'github',
        }),
        charge('2026-09-30', 'GitHub Shared Storage', 50n, 'USD', {
          periodStart: parse('2026-09-01'),
          periodEnd: parse('2026-09-30'),
          vendorHint: 'github',
        }),
      ]);
      expect(report.items).toHaveLength(1);
      expect(report.items[0]).toMatchObject({ amountMinor: 350n, vendor: { vendorId: 'github' } });
    });

    it('should keep unknown invoice lists without periods as invoice items', () => {
      const bill = (date: string, amount: bigint) =>
        charge(date, 'INV-0012', amount, 'USD', { vendorHint: 'unknown' });
      const [item] = detect([bill('2026-08-03', 2000n), bill('2026-09-03', 3100n)]).items;
      expect(item).toMatchObject({
        source: 'invoice_export',
        cadence: 'monthly',
        vendor: { known: false, name: 'Unknown vendor' },
      });
    });

    it('should use the vendor hint when the description is unknown', () => {
      const [item] = detect([
        charge('2026-10-01', 'Team plan', 4900n, 'USD', {
          periodStart: parse('2026-10-01'),
          periodEnd: parse('2026-11-01'),
          vendorHint: 'Acme Hosting',
        }),
      ]).items;
      expect(item?.vendor).toMatchObject({ known: false, name: 'Acme Hosting' });
      expect(item?.fingerprint).toBe('statement:acme-hosting:USD:monthly');
    });
  });
});
