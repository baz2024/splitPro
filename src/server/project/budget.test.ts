import {
  bucketFor,
  getBudgetStatus,
  getMonthWindow,
  getNextRun,
  getSafeToSpendPerDay,
  isDueWithin,
  parseDecimalToMinor,
  percentOf,
  pickProjectCurrency,
  summarizeSpend,
} from './budget';

describe('getMonthWindow', () => {
  it('should count days left after today in UTC', () => {
    const window = getMonthWindow(new Date('2026-11-01T10:00:00Z'));
    expect(window.daysInMonth).toBe(30);
    expect(window.dayOfMonth).toBe(1);
    expect(window.daysLeft).toBe(29);
    expect(window.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(window.todayStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('should use local month boundaries for a timezone offset', () => {
    // 02:00 UTC on Nov 1 is still Oct 31 in New York (UTC-4 → offset 240).
    const window = getMonthWindow(new Date('2026-11-01T02:00:00Z'), 240);
    expect(window.month).toBe(9);
    expect(window.dayOfMonth).toBe(31);
    expect(window.daysLeft).toBe(0);
    expect(window.start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(window.todayStart.toISOString()).toBe('2026-10-31T04:00:00.000Z');
  });

  it('should handle timezones east of UTC', () => {
    // 22:00 UTC on Oct 31 is Nov 1 in Amman (UTC+3 → offset -180).
    const window = getMonthWindow(new Date('2026-10-31T22:00:00Z'), -180);
    expect(window.month).toBe(10);
    expect(window.dayOfMonth).toBe(1);
    expect(window.start.toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });
});

describe('bucketFor', () => {
  it('should put anything recurring into subscriptions', () => {
    expect(bucketFor({ category: 'aiApis', isRecurring: true })).toBe('subscriptions');
    expect(bucketFor({ category: 'codingAgents', isRecurring: true })).toBe('subscriptions');
  });

  it('should classify metered usage categories as API usage', () => {
    ['aiApis', 'cloudHosting', 'databases', 'messagingApis', 'monitoring'].forEach((category) => {
      expect(bucketFor({ category, isRecurring: false })).toBe('apiUsage');
    });
  });

  it('should classify coding agents as agent runs', () => {
    expect(bucketFor({ category: 'codingAgents', isRecurring: false })).toBe('agentRuns');
  });

  it('should fall back to other', () => {
    expect(bucketFor({ category: 'diningOut', isRecurring: false })).toBe('other');
    expect(bucketFor({ category: 'saas', isRecurring: false })).toBe('other');
  });
});

describe('summarizeSpend', () => {
  it('should total only the chosen currency and flag skipped ones', () => {
    const result = summarizeSpend(
      [
        { amount: 2000n, currency: 'USD', category: 'cloudHosting', isRecurring: true },
        { amount: 1240n, currency: 'USD', category: 'aiApis', isRecurring: false },
        { amount: 500n, currency: 'USD', category: 'codingAgents', isRecurring: false },
        { amount: 4850n, currency: 'USD', category: 'diningOut', isRecurring: false },
        { amount: 9999n, currency: 'EUR', category: 'aiApis', isRecurring: false },
      ],
      'USD',
    );
    expect(result.spent).toBe(8590n);
    expect(result.buckets).toEqual({
      subscriptions: 2000n,
      apiUsage: 1240n,
      agentRuns: 500n,
      other: 4850n,
    });
    expect(result.skippedOtherCurrencies).toBe(true);
  });

  it('should return zeros for no expenses', () => {
    const result = summarizeSpend([], 'USD');
    expect(result.spent).toBe(0n);
    expect(result.skippedOtherCurrencies).toBe(false);
  });
});

describe('getBudgetStatus', () => {
  const base = { dayOfMonth: 15, daysInMonth: 30 };

  it('should report no budget', () => {
    expect(getBudgetStatus({ ...base, budget: null, spent: 100n })).toBe('no_budget');
    expect(getBudgetStatus({ ...base, budget: 0n, spent: 100n })).toBe('no_budget');
  });

  it('should be on track when the pace fits', () => {
    expect(getBudgetStatus({ ...base, budget: 200000n, spent: 100000n })).toBe('on_track');
  });

  it('should be at risk when the pace overshoots', () => {
    expect(getBudgetStatus({ ...base, budget: 200000n, spent: 100100n })).toBe('at_risk');
  });

  it('should be over once spent exceeds budget', () => {
    expect(getBudgetStatus({ ...base, budget: 200000n, spent: 200001n })).toBe('over');
  });
});

describe('getSafeToSpendPerDay', () => {
  it('should spread what is left over today and the remaining days', () => {
    expect(getSafeToSpendPerDay(114200n, 18)).toBe(6010n);
    expect(getSafeToSpendPerDay(3000n, 0)).toBe(3000n);
  });

  it('should be zero when nothing is left', () => {
    expect(getSafeToSpendPerDay(0n, 10)).toBe(0n);
    expect(getSafeToSpendPerDay(-500n, 10)).toBe(0n);
  });
});

describe('percentOf', () => {
  it('should clamp between 0 and 100', () => {
    expect(percentOf(50n, 200n)).toBe(25);
    expect(percentOf(300n, 200n)).toBe(100);
    expect(percentOf(-1n, 200n)).toBe(0);
    expect(percentOf(10n, 0n)).toBe(0);
  });
});

describe('getNextRun / isDueWithin', () => {
  const now = new Date('2026-11-01T12:00:00Z');

  it('should find the next monthly run', () => {
    expect(getNextRun('0 9 5 * *', now)?.toISOString()).toBe('2026-11-05T09:00:00.000Z');
    expect(isDueWithin('0 9 5 * *', now, 7)).toBe(true);
    expect(isDueWithin('0 9 20 * *', now, 7)).toBe(false);
  });

  it('should understand the pg_cron last-day marker', () => {
    expect(getNextRun('0 0 $ * *', now)?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });

  it('should return null for an invalid schedule', () => {
    expect(getNextRun('not a cron', now)).toBeNull();
    expect(isDueWithin('not a cron', now, 7)).toBe(false);
  });
});

describe('pickProjectCurrency', () => {
  it('should prefer the budget currency, then group default, then most used', () => {
    expect(
      pickProjectCurrency({ budgetCurrency: 'EUR', defaultCurrency: 'USD', expenseCurrencies: [] }),
    ).toBe('EUR');
    expect(
      pickProjectCurrency({ budgetCurrency: null, defaultCurrency: 'JOD', expenseCurrencies: [] }),
    ).toBe('JOD');
    expect(
      pickProjectCurrency({
        budgetCurrency: null,
        defaultCurrency: null,
        expenseCurrencies: ['USD', 'GBP', 'GBP'],
      }),
    ).toBe('GBP');
    expect(
      pickProjectCurrency({ budgetCurrency: null, defaultCurrency: null, expenseCurrencies: [] }),
    ).toBe('USD');
  });
});

describe('parseDecimalToMinor', () => {
  it('should parse whole and fractional amounts', () => {
    expect(parseDecimalToMinor('2000', 2)).toBe(200000n);
    expect(parseDecimalToMinor('19.9', 2)).toBe(1990n);
    expect(parseDecimalToMinor('19.99', 2)).toBe(1999n);
    expect(parseDecimalToMinor('500', 0)).toBe(500n);
    expect(parseDecimalToMinor('1.250', 3)).toBe(1250n);
  });

  it('should reject malformed input or too many decimals', () => {
    expect(parseDecimalToMinor('', 2)).toBeNull();
    expect(parseDecimalToMinor('-5', 2)).toBeNull();
    expect(parseDecimalToMinor('1,000', 2)).toBeNull();
    expect(parseDecimalToMinor('1.999', 2)).toBeNull();
  });
});
