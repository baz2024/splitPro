import {
  baseServiceName,
  cadenceFromCron,
  daysUntil,
  monthlyAmount,
  nextRunDate,
  percentChange,
  splitKindFromParticipants,
  summariseRunRates,
  summariseUsage,
  usageServiceKey,
  usageServiceName,
} from '~/server/subscriptions/helpers';

const NOW = new Date('2026-11-14T10:00:00Z');

describe('cadenceFromCron', () => {
  it.each([
    ['0 0 1 * *', 'monthly'],
    ['0 0 $ * *', 'monthly'],
    ['30 9 15 * *', 'monthly'],
    ['0 0 * * 1', 'weekly'],
    ['0 0 1 1 *', 'yearly'],
    ['0 0 * * *', 'other'],
    ['0 0 1,15 * *', 'other'],
    ['not a cron', 'other'],
  ])('classifies %s as %s', (cron, expected) => {
    expect(cadenceFromCron(cron)).toBe(expected);
  });
});

describe('nextRunDate', () => {
  it('returns the next UTC run after now', () => {
    expect(nextRunDate('0 0 15 * *', NOW)?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('understands the pg_cron last-day marker', () => {
    expect(nextRunDate('0 0 $ * *', NOW)?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });

  it('returns null for an invalid expression', () => {
    expect(nextRunDate('nope', NOW)).toBeNull();
  });
});

describe('monthlyAmount', () => {
  it('keeps monthly amounts', () => {
    expect(monthlyAmount(2000n, 'monthly', '0 0 1 * *', NOW)).toBe(2000n);
  });

  it('divides yearly amounts by 12', () => {
    expect(monthlyAmount(12000n, 'yearly', '0 0 1 1 *', NOW)).toBe(1000n);
  });

  it('scales weekly amounts by 52 / 12', () => {
    expect(monthlyAmount(1200n, 'weekly', '0 0 * * 1', NOW)).toBe(5200n);
  });

  it('counts yearly occurrences for other schedules', () => {
    expect(monthlyAmount(1200n, 'other', '0 0 1,15 * *', NOW)).toBe(2400n);
  });
});

describe('daysUntil', () => {
  it('counts calendar days', () => {
    expect(daysUntil(new Date('2026-11-14T23:00:00Z'), NOW)).toBe(0);
    expect(daysUntil(new Date('2026-11-15T00:00:00Z'), NOW)).toBe(1);
    expect(daysUntil(new Date('2026-11-17T12:00:00Z'), NOW)).toBe(3);
  });
});

describe('summariseRunRates', () => {
  it('sums per currency with the most common currency first', () => {
    const result = summariseRunRates(
      [
        { currency: 'EUR', monthlyAmount: 5000n },
        { currency: 'USD', monthlyAmount: 2000n },
        { currency: 'USD', monthlyAmount: 2500n },
      ],
      'EUR',
    );
    expect(result).toEqual([
      { currency: 'USD', monthly: 4500n, count: 2 },
      { currency: 'EUR', monthly: 5000n, count: 1 },
    ]);
  });

  it('breaks ties with the preferred currency', () => {
    const result = summariseRunRates(
      [
        { currency: 'USD', monthlyAmount: 9000n },
        { currency: 'JOD', monthlyAmount: 100n },
      ],
      'JOD',
    );
    expect(result.map(({ currency }) => currency)).toEqual(['JOD', 'USD']);
  });

  it('returns nothing for no subscriptions', () => {
    expect(summariseRunRates([], 'USD')).toEqual([]);
  });
});

describe('percentChange', () => {
  it('rounds the change', () => {
    expect(percentChange(13800n, 10000n)).toBe(38);
    expect(percentChange(8800n, 10000n)).toBe(-12);
  });

  it('returns null without a previous value', () => {
    expect(percentChange(500n, 0n)).toBeNull();
  });
});

describe('summariseUsage', () => {
  const expense = (name: string, amount: bigint, date: string, category = 'aiApis') => ({
    id: `${name}-${date}`,
    groupId: null,
    name,
    amount,
    currency: 'USD',
    category,
    expenseDate: new Date(date),
  });

  it('groups by service and compares with last month', () => {
    const result = summariseUsage(
      [
        expense('Anthropic API', 30000n, '2026-11-02T00:00:00Z'),
        expense('anthropic usage', 21200n, '2026-11-10T00:00:00Z'),
        expense('Anthropic API', 37100n, '2026-10-05T00:00:00Z'),
        expense('OpenAI API', 27900n, '2026-11-03T00:00:00Z'),
        expense('OpenAI API', 31700n, '2026-10-03T00:00:00Z'),
        expense('Old', 100n, '2026-08-01T00:00:00Z'),
        expense('Groceries', 900n, '2026-11-03T00:00:00Z', 'groceries'),
      ],
      NOW,
    );

    expect(
      result.map(({ key, thisMonth, lastMonth, changePercent }) => ({
        key,
        thisMonth,
        lastMonth,
        changePercent,
      })),
    ).toEqual([
      { key: 'anthropic|USD', thisMonth: 51200n, lastMonth: 37100n, changePercent: 38 },
      { key: 'openai|USD', thisMonth: 27900n, lastMonth: 31700n, changePercent: -12 },
    ]);
    expect(result[0]?.name).toBe('Anthropic');
    expect(result[0]?.lastExpenseId).toBe('anthropic usage-2026-11-10T00:00:00Z');
  });

  it('names rows by service so agent model suffixes do not leak', () => {
    const result = summariseUsage(
      [
        expense('Anthropic API · claude-opus', 1200n, '2026-11-02T00:00:00Z'),
        expense('Anthropic API · claude-haiku', 300n, '2026-11-12T00:00:00Z'),
        expense('Acme Search · nightly crawl', 500n, '2026-11-05T00:00:00Z'),
        expense('Acme Search · weekly', 250n, '2026-11-06T00:00:00Z'),
      ],
      NOW,
    );

    expect(result.map(({ key, name, thisMonth }) => ({ key, name, thisMonth }))).toEqual([
      { key: 'anthropic|USD', name: 'Anthropic', thisMonth: 1500n },
      { key: 'acme search|USD', name: 'Acme Search', thisMonth: 750n },
    ]);
  });

  it('reports the billing provider of the newest expense', () => {
    const [row] = summariseUsage(
      [
        { ...expense('Vercel', 900n, '2026-11-01T00:00:00Z', 'cloudHosting'), syncedFrom: null },
        {
          ...expense('Vercel · function invocations', 400n, '2026-11-13T00:00:00Z', 'cloudHosting'),
          syncedFrom: 'VERCEL',
        },
      ],
      NOW,
    );

    expect(row?.name).toBe('Vercel');
    expect(row?.syncedFrom).toBe('VERCEL');
  });

  it('drops services with no spend this month', () => {
    expect(
      summariseUsage([expense('Twilio', 500n, '2026-10-20T00:00:00Z', 'messagingApis')], NOW),
    ).toEqual([]);
  });
});

describe('usage service names', () => {
  it('strips the " · " detail suffix', () => {
    expect(baseServiceName('Anthropic API · claude-opus-4')).toBe('Anthropic API');
    expect(baseServiceName('  Twilio  ')).toBe('Twilio');
    expect(baseServiceName('· only detail')).toBe('· only detail');
  });

  it('uses the catalog name and id when the service is known', () => {
    expect(usageServiceName('Anthropic API · claude-opus-4')).toBe('Anthropic');
    expect(usageServiceKey('Anthropic API · claude-opus-4')).toBe('anthropic');
  });

  it('falls back to the base name for unknown services', () => {
    expect(usageServiceName('Acme Search · crawl')).toBe('Acme Search');
    expect(usageServiceKey('Acme  Search · crawl')).toBe('acme search');
  });
});

describe('splitKindFromParticipants', () => {
  it('treats a single participant as personal', () => {
    expect(splitKindFromParticipants([{ userId: 1, amount: 0n }])).toEqual({ kind: 'personal' });
  });

  it('counts people with balance entries', () => {
    expect(
      splitKindFromParticipants([
        { userId: 1, amount: 1000n },
        { userId: 2, amount: -1000n },
      ]),
    ).toEqual({ kind: 'split', ways: 2 });
  });
});
