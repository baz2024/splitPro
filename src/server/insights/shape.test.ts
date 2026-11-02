import {
  type SpendRow,
  averagePerPeriod,
  compareToAverage,
  currenciesInMonth,
  dayKeyOf,
  getDailyWindow,
  getTrendWindow,
  hasAnySpend,
  monthKeyOf,
  monthlyCostByService,
  monthlyTotals,
  otherCurrencyTotals,
  periodTotals,
  pickChartCurrency,
  rankWithOther,
  topCategories,
  topCategoriesBySource,
  totalsBySource,
} from './shape';

const row = (
  month: string,
  currency: string,
  total: bigint,
  category?: string,
  count = 1,
): SpendRow => ({ month, currency, total, count, ...(category ? { category } : {}) });

describe('monthKeyOf', () => {
  it('should zero-pad 0-based months', () => {
    expect(monthKeyOf(2026, 0)).toBe('2026-01');
    expect(monthKeyOf(2026, 10)).toBe('2026-11');
  });
});

describe('getTrendWindow', () => {
  describe('UTC viewer', () => {
    it('should return six months ending with the current one', () => {
      const window = getTrendWindow(new Date('2026-11-01T10:00:00Z'), 0, 6);
      expect(window.slots.map((slot) => slot.key)).toEqual([
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
        '2026-11',
      ]);
      expect(window.start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    });

    it('should cross a year boundary', () => {
      const window = getTrendWindow(new Date('2026-02-10T00:00:00Z'), 0, 4);
      expect(window.slots.map((slot) => slot.key)).toEqual([
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
      ]);
    });
  });

  describe('Time zones', () => {
    it('should use the viewer local month (UTC+3 is offset -180)', () => {
      // 22:30 UTC on Oct 31 is already Nov 1 in UTC+3.
      const window = getTrendWindow(new Date('2026-10-31T22:30:00Z'), -180, 2);
      expect(window.slots.map((slot) => slot.key)).toEqual(['2026-10', '2026-11']);
      expect(window.start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-11-30T21:00:00.000Z');
    });
  });

  describe('Bounds', () => {
    it('should clamp the month count to 2..12', () => {
      const now = new Date('2026-11-01T00:00:00Z');
      expect(getTrendWindow(now, 0, 1).slots).toHaveLength(2);
      expect(getTrendWindow(now, 0, 40).slots).toHaveLength(12);
    });
  });
});

describe('pickChartCurrency', () => {
  it('should keep the preferred currency when it has spend', () => {
    const rows = [row('2026-11', 'EUR', 100n, undefined, 9), row('2026-11', 'USD', 5n)];
    expect(pickChartCurrency(rows, 'USD')).toBe('USD');
  });

  it('should fall back to the currency with the most expenses', () => {
    const rows = [
      row('2026-10', 'EUR', 100n, undefined, 3),
      row('2026-11', 'JOD', 5n, undefined, 1),
    ];
    expect(pickChartCurrency(rows, 'USD')).toBe('EUR');
  });

  it('should return the preferred currency, else USD, without rows', () => {
    expect(pickChartCurrency([], 'JOD')).toBe('JOD');
    expect(pickChartCurrency([], null)).toBe('USD');
  });
});

describe('currenciesInMonth', () => {
  it('should repeat each currency once per expense in that month only', () => {
    const rows = [
      row('2026-11', 'USD', 1n, 'food', 2),
      row('2026-11', 'EUR', 1n, 'food', 1),
      row('2026-10', 'JOD', 1n, 'food', 5),
    ];
    expect(currenciesInMonth(rows, '2026-11')).toEqual(['USD', 'USD', 'EUR']);
  });
});

describe('monthlyTotals', () => {
  it('should sum one currency per slot and zero-fill empty months', () => {
    const { slots } = getTrendWindow(new Date('2026-11-15T00:00:00Z'), 0, 3);
    const rows = [
      row('2026-09', 'USD', 1_000n, 'food'),
      row('2026-09', 'USD', 500n, 'tech'),
      row('2026-11', 'USD', 250n, 'food'),
      row('2026-11', 'EUR', 9_999n, 'food'),
    ];
    expect(monthlyTotals(slots, rows, 'USD').map((month) => month.total)).toEqual([
      1_500n,
      0n,
      250n,
    ]);
  });
});

describe('otherCurrencyTotals', () => {
  it('should total every other currency, largest first, dropping zeros', () => {
    const rows = [
      row('2026-10', 'USD', 1_000n),
      row('2026-10', 'EUR', 300n),
      row('2026-11', 'EUR', 200n),
      row('2026-11', 'JOD', 900n),
      row('2026-11', 'GBP', 0n),
    ];
    expect(otherCurrencyTotals(rows, 'USD')).toEqual([
      { currency: 'JOD', total: 900n },
      { currency: 'EUR', total: 500n },
    ]);
  });
});

describe('rankWithOther', () => {
  it('should keep the top items and fold the rest into other', () => {
    const totals = new Map([
      ['a', 600n],
      ['b', 200n],
      ['c', 100n],
      ['d', 60n],
      ['e', 40n],
    ]);
    const ranked = rankWithOther(totals, 2);
    expect(ranked.map((item) => [item.key, item.total, item.isOther])).toEqual([
      ['a', 600n, false],
      ['b', 200n, false],
      ['other', 200n, true],
    ]);
    expect(ranked.map((item) => item.percent)).toEqual([60, 20, 20]);
  });

  it('should not fold a single leftover item', () => {
    const totals = new Map([
      ['a', 3n],
      ['b', 2n],
      ['c', 1n],
    ]);
    expect(rankWithOther(totals, 2).map((item) => item.key)).toEqual(['a', 'b', 'c']);
  });

  it('should drop zero and negative totals', () => {
    const totals = new Map([
      ['a', 10n],
      ['refund', -5n],
      ['zero', 0n],
    ]);
    expect(rankWithOther(totals).map((item) => item.key)).toEqual(['a']);
  });
});

describe('topCategories', () => {
  it('should total categories in the chart currency across months', () => {
    const rows = [
      row('2026-10', 'USD', 400n, 'aiApis'),
      row('2026-11', 'USD', 100n, 'aiApis'),
      row('2026-11', 'USD', 500n, 'cloudHosting'),
      row('2026-11', 'EUR', 9_000n, 'food'),
    ];
    expect(topCategories(rows, 'USD').map((item) => [item.key, item.total])).toEqual([
      ['aiApis', 500n],
      ['cloudHosting', 500n],
    ]);
  });

  it('should keep a stored "other" category apart from the folded remainder', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'other', 'g'].map((category, index) =>
      row('2026-11', 'USD', BigInt(100 - index), category),
    );
    const ranked = topCategories(rows, 'USD');
    expect(ranked).toHaveLength(6);
    expect(ranked.at(-1)).toMatchObject({ isOther: true, total: 189n });
    expect(ranked.filter((item) => item.isOther)).toHaveLength(1);
  });
});

describe('monthlyCostByService', () => {
  it('should merge plans of one service and skip other currencies', () => {
    const services = monthlyCostByService(
      [
        { description: 'Vercel Pro', currency: 'USD', monthlyAmount: 2_000n },
        { description: 'Vercel · team seat', currency: 'USD', monthlyAmount: 1_000n },
        { description: 'Cursor', currency: 'USD', monthlyAmount: 2_000n },
        { description: 'Netflix', currency: 'EUR', monthlyAmount: 1_500n },
      ],
      'USD',
    );
    expect(services.map((service) => [service.label, service.total])).toEqual(
      expect.arrayContaining([['Cursor', 2_000n]]),
    );
    expect(services.reduce((sum, service) => sum + service.total, 0n)).toBe(5_000n);
    expect(services.every((service) => !service.isOther)).toBe(true);
  });

  it('should count the subscriptions folded into other', () => {
    const items = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'].map((name, index) => ({
      description: name,
      currency: 'USD',
      monthlyAmount: BigInt(1_000 - index),
    }));
    const services = monthlyCostByService(items, 'USD', 3);
    expect(services).toHaveLength(4);
    expect(services.at(-1)).toMatchObject({ isOther: true, count: 4, label: '' });
  });
});

describe('compareToAverage', () => {
  const months = (totals: bigint[]) =>
    totals.map((total, index) => ({ key: `m${index}`, year: 2026, month: index, total }));

  it('should compare the last month with the average of earlier non-empty months', () => {
    const result = compareToAverage(months([100n, 0n, 300n, 300n]));
    expect(result).toEqual({ current: 300n, average: 200n, changePercent: 50 });
  });

  it('should return null average and change without history', () => {
    expect(compareToAverage(months([0n, 0n, 500n]))).toEqual({
      current: 500n,
      average: null,
      changePercent: null,
    });
  });

  it('should report a drop as a negative percent', () => {
    expect(compareToAverage(months([400n, 100n])).changePercent).toBe(-75);
  });
});

describe('hasAnySpend', () => {
  it('should be false only when every month is zero and no other currency has spend', () => {
    const zero = [{ key: 'm', year: 2026, month: 0, total: 0n }];
    expect(hasAnySpend(zero, [])).toBe(false);
    expect(hasAnySpend(zero, [{ currency: 'EUR', total: 1n }])).toBe(true);
    expect(hasAnySpend([{ ...zero[0]!, total: 5n }], [])).toBe(true);
  });
});

describe('getDailyWindow', () => {
  it('should return the last 30 local days ending today', () => {
    const window = getDailyWindow(new Date('2026-11-01T10:00:00Z'), 0, 30);
    expect(window.slots).toHaveLength(30);
    expect(window.slots[0]?.key).toBe('2026-10-03');
    expect(window.slots.at(-1)?.key).toBe('2026-11-01');
    expect(window.start.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('should use the viewer local day (UTC+3 is offset -180)', () => {
    const window = getDailyWindow(new Date('2026-10-31T22:30:00Z'), -180, 2);
    expect(window.slots.map((slot) => slot.key)).toEqual(['2026-10-31', '2026-11-01']);
    expect(window.start.toISOString()).toBe('2026-10-30T21:00:00.000Z');
  });

  it('should zero-pad day keys', () => {
    expect(dayKeyOf(2026, 0, 5)).toBe('2026-01-05');
  });
});

describe('periodTotals', () => {
  it('should total daily rows per day slot', () => {
    const slots = [{ key: '2026-11-01' }, { key: '2026-11-02' }];
    const rows = [
      row('2026-11-01', 'USD', 100n),
      row('2026-11-01', 'USD', 50n, 'aiApis'),
      row('2026-11-02', 'EUR', 999n),
    ];
    expect(periodTotals(slots, rows, 'USD').map((slot) => slot.total)).toEqual([150n, 0n]);
  });
});

describe('currenciesInMonth with daily rows', () => {
  it('should read daily rows of the month too', () => {
    const rows = [row('2026-11-01', 'USD', 1n, undefined, 2), row('2026-10-31', 'EUR', 1n)];
    expect(currenciesInMonth(rows, '2026-11')).toEqual(['USD', 'USD']);
  });
});

describe('averagePerPeriod', () => {
  it('should average from the first period with spend', () => {
    expect(averagePerPeriod([{ total: 0n }, { total: 0n }, { total: 300n }, { total: 0n }])).toBe(
      150n,
    );
  });

  it('should round to the nearest minor unit', () => {
    expect(averagePerPeriod([{ total: 100n }, { total: 0n }, { total: 0n }])).toBe(33n);
  });

  it('should be null with no spend', () => {
    expect(averagePerPeriod([{ total: 0n }])).toBeNull();
    expect(averagePerPeriod([])).toBeNull();
  });
});

describe('Human vs agent', () => {
  const rows: SpendRow[] = [
    { ...row('2026-11', 'USD', 500n, 'aiApis'), source: 'agent' },
    { ...row('2026-11', 'USD', 200n, 'codingAgents'), source: 'agent' },
    { ...row('2026-11', 'USD', 300n, 'hotel'), source: 'human' },
    row('2026-11', 'USD', 100n, 'diningOut'),
    { ...row('2026-11', 'EUR', 900n, 'aiApis'), source: 'agent' },
  ];

  it('should split totals by source, counting unmarked rows as human', () => {
    expect(totalsBySource(rows, 'USD')).toEqual({ human: 400n, agent: 700n });
  });

  it('should rank categories per source', () => {
    const ranked = topCategoriesBySource(rows, 'USD');
    expect(ranked.agent.map((item) => [item.key, item.total])).toEqual([
      ['aiApis', 500n],
      ['codingAgents', 200n],
    ]);
    expect(ranked.human.map((item) => item.key)).toEqual(['hotel', 'diningOut']);
    expect(ranked.all).toHaveLength(4);
  });
});
