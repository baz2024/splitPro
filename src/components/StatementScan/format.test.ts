import {
  badgeService,
  buildDecisions,
  daysBetween,
  formatRange,
  moneyText,
  needsAmount,
  resellerName,
  sortForReview,
} from './format';
import { makeScanItem } from './testUtils';

describe('badgeService', () => {
  const vendor = (name: string) => ({
    vendor: { vendorId: null, name, category: 'software', known: false },
  });

  it('should drop a note in brackets so it stays out of the initials', () => {
    expect(badgeService(vendor('Apple (App Store / iCloud)'))).toBe('Apple');
  });

  it('should keep a plain name', () => {
    expect(badgeService(vendor('ChatGPT'))).toBe('ChatGPT');
  });

  it('should keep a name that is only brackets', () => {
    expect(badgeService(vendor('(Unknown)'))).toBe('(Unknown)');
  });
});

describe('statement scan format helpers', () => {
  describe('buildDecisions', () => {
    it('skips undecided items and sends only real corrections', () => {
      const items = [
        makeScanItem({ id: 'a' }),
        makeScanItem({ id: 'b' }),
        makeScanItem({ id: 'c' }),
      ];
      const decisions = buildDecisions(items, {
        a: { decision: 'using', name: 'Figma', amountMinor: 2000n, cadence: 'monthly' },
        b: { decision: 'cancel', name: '  Figma Pro ', amountMinor: 1500n, cadence: 'yearly' },
        c: { decision: null },
      });
      expect(decisions).toEqual([
        { id: 'a', decision: 'using' },
        {
          id: 'b',
          decision: 'cancel',
          name: 'Figma Pro',
          amountMinor: 1500n,
          cadence: 'yearly',
        },
      ]);
    });
  });

  describe('needsAmount', () => {
    const trial = makeScanItem({ amountMinor: 0n, cadence: null, flags: ['trial'] });

    it('requires a price for kept trials but not for dismissals', () => {
      expect(needsAmount(trial, { decision: 'not_sure' })).toBe(true);
      expect(needsAmount(trial, { decision: 'not_subscription' })).toBe(false);
      expect(needsAmount(trial, undefined)).toBe(false);
      expect(needsAmount(trial, { decision: 'using', amountMinor: 900n })).toBe(false);
    });
  });

  describe('sortForReview', () => {
    it('puts flagged items first, most at risk first', () => {
      const sorted = sortForReview([
        makeScanItem({ id: 'plain', yearlyMinor: 99000n }),
        makeScanItem({ id: 'small', flags: ['duplicate'], atRiskYearlyMinor: 1000n }),
        makeScanItem({ id: 'big', flags: ['annual_soon'], atRiskYearlyMinor: 50000n }),
      ]);
      expect(sorted.map((item) => item.id)).toEqual(['big', 'small', 'plain']);
    });
  });

  describe('display', () => {
    it('drops cents on round amounts only when asked', () => {
      expect(moneyText({ amount: 114000n, currency: 'USD', locale: 'en', whole: true })).toBe(
        '$1,140',
      );
      expect(moneyText({ amount: 999n, currency: 'USD', locale: 'en', whole: true })).toBe('$9.99');
      expect(moneyText({ amount: 2000n, currency: 'USD', locale: 'en' })).toBe('$20.00');
    });

    it('formats ranges and day differences', () => {
      expect(
        formatRange({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 11, day: 1 }, 'en'),
      ).toBe('Jan – Nov 2026');
      expect(
        formatRange({ year: 2025, month: 11, day: 5 }, { year: 2026, month: 2, day: 1 }, 'en'),
      ).toBe('Nov 2025 – Feb 2026');
      expect(
        daysBetween({ year: 2026, month: 12, day: 30 }, { year: 2027, month: 1, day: 2 }),
      ).toBe(3);
    });

    it('names resellers', () => {
      expect(resellerName('paddle')).toBe('Paddle');
      expect(resellerName('google')).toBe('Google Play');
      expect(resellerName('chargebee')).toBe('Chargebee');
    });
  });
});
