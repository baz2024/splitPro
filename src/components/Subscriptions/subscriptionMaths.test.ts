import {
  cadenceFromCron,
  chargesBetween,
  nextRunDate,
  yearlyAmount,
} from '~/server/subscriptions/helpers';

import {
  chargedSoFarThisMonth,
  monthCash,
  previousCharge,
  unusedSavings,
  yearlyTotal,
} from './subscriptionMaths';

const item = (overrides: Partial<Parameters<typeof yearlyTotal>[0][number]> = {}) => ({
  currency: 'USD',
  yearlyAmount: 24000n,
  remainingThisMonth: 0n,
  unused: false,
  nextDueDate: null,
  ...overrides,
});

describe('subscriptionMaths', () => {
  describe('yearlyAmount', () => {
    const from = new Date('2026-11-01T00:00:00Z');

    it('should annualise each cadence', () => {
      expect(yearlyAmount(2000n, 'monthly', '0 0 5 * *', from)).toBe(24000n);
      expect(yearlyAmount(9900n, 'yearly', '0 0 5 3 *', from)).toBe(9900n);
      expect(yearlyAmount(500n, 'weekly', '0 0 * * 1', from)).toBe(26000n);
    });
  });

  describe('chargesBetween', () => {
    it('should count charges left before the month ends', () => {
      const from = new Date('2026-11-10T12:00:00Z');
      const end = new Date('2026-12-01T00:00:00Z');
      expect(chargesBetween('0 0 20 * *', from, end)).toBe(1);
      expect(chargesBetween('0 0 5 * *', from, end)).toBe(0);
      // Mondays 16, 23 and 30 November.
      expect(chargesBetween('0 0 * * 1', from, end)).toBe(3);
    });

    it('should be zero for an empty range or a bad cron', () => {
      const now = new Date('2026-11-10T00:00:00Z');
      expect(chargesBetween('0 0 20 * *', now, now)).toBe(0);
      expect(chargesBetween('nonsense', now, new Date('2026-12-01T00:00:00Z'))).toBe(0);
    });
  });

  describe('yearlyTotal', () => {
    it('should sum yearly costs in one currency only', () => {
      expect(
        yearlyTotal(
          [item(), item({ yearlyAmount: 1200n }), item({ currency: 'EUR', yearlyAmount: 9n })],
          'USD',
        ),
      ).toBe(25200n);
    });
  });

  describe('unusedSavings', () => {
    it('should add up what cancelling unused services saves a year', () => {
      expect(
        unusedSavings(
          [
            item({ unused: true, yearlyAmount: 24000n }),
            item({ unused: true, yearlyAmount: 24000n }),
            item({ unused: false }),
            item({ unused: true, currency: 'EUR' }),
          ],
          'USD',
        ),
      ).toEqual({ count: 2, yearly: 48000n });
    });

    it('should be empty when nothing is unused', () => {
      expect(unusedSavings([item()], 'USD')).toEqual({ count: 0, yearly: 0n });
    });
  });

  describe('monthCash', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const monthStartUtc = new Date('2026-11-01T00:00:00Z');
    const monthEnd = new Date('2026-12-01T00:00:00Z');

    /** A subscription built the way the server builds it, from its cron and one charge. */
    const fromCron = (schedule: string, amount: bigint, currency = 'USD') => ({
      ...item({ currency }),
      amount,
      cadence: cadenceFromCron(schedule),
      remainingThisMonth: amount * BigInt(chargesBetween(schedule, now, monthEnd)),
      nextDueDate: nextRunDate(schedule, now),
    });

    const SCHEDULES = [
      '0 0 5 * *', // Monthly, charged 5 Nov
      '0 0 20 * *', // Monthly, due 20 Nov
      '0 0 * * 1', // Weekly: Mondays 2 and 9 paid, 16, 23 and 30 to pay
      '0 0 3 11 *', // Yearly, renewed 3 Nov
      '0 0 25 11 *', // Yearly, renews 25 Nov
      '0 0 5 3 *', // Yearly, renews in March: nothing this month
      '0 0 1 * *', // Monthly on the 1st, at the month's first instant
    ] as const;

    const fixture = [
      fromCron('0 0 5 * *', 2000n),
      fromCron('0 0 20 * *', 2500n),
      fromCron('0 0 * * 1', 500n),
      fromCron('0 0 3 11 *', 9900n),
      fromCron('0 0 25 11 *', 15000n),
      fromCron('0 0 5 3 *', 12000n),
      fromCron('0 0 1 * *', 700n),
      fromCron('0 0 5 * *', 999n, 'EUR'),
    ];

    it('should make paid + still to pay equal the month total for a mixed set', () => {
      const result = monthCash(fixture, 'USD', now);
      expect(result.paid).toBe(2000n + 2n * 500n + 9900n + 700n);
      expect(result.remaining).toBe(2500n + 3n * 500n + 15000n);
      expect(result.paid + result.remaining).toBe(result.total);
      expect(result.total).toBe(32600n);
    });

    it('should count each scheduled charge exactly once', () => {
      SCHEDULES.forEach((schedule) => {
        const row = fromCron(schedule, 100n);
        const wholeMonth =
          100n * BigInt(chargesBetween(schedule, new Date(monthStartUtc.getTime() - 1), monthEnd));
        expect(chargedSoFarThisMonth(row, now) + row.remainingThisMonth).toBe(wholeMonth);
      });
    });

    it('should count a yearly plan only in the month it renews', () => {
      expect(chargedSoFarThisMonth(fromCron('0 0 5 3 *', 12000n), now)).toBe(0n);
      expect(chargedSoFarThisMonth(fromCron('0 0 3 11 *', 9900n), now)).toBe(9900n);
    });

    it('should find the soonest charge still due', () => {
      expect(monthCash(fixture, 'USD', now).nextCharge).toEqual(new Date('2026-11-16T00:00:00Z'));
    });

    it('should have nothing paid or due without a schedule', () => {
      expect(
        monthCash([{ ...item(), amount: 500n, cadence: 'other' as const }], 'USD', now),
      ).toEqual({ paid: 0n, remaining: 0n, total: 0n, nextCharge: null });
    });
  });

  describe('previousCharge', () => {
    it('should skip months without the day, as the cron does', () => {
      expect(previousCharge(new Date('2026-12-31T00:00:00Z'), 'monthly')).toEqual(
        new Date('2026-10-31T00:00:00Z'),
      );
      expect(previousCharge(new Date('2026-11-10T00:00:00Z'), 'other')).toBeNull();
    });
  });
});
