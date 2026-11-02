import { isValidCapInput, minorToDecimal } from '~/components/Agent/capInput';

import {
  agentsNeedingAttention,
  buildAgentSpend,
  computeCapStatus,
  pickKeyCurrency,
  projectMonthSpend,
} from './caps';

const MID_MONTH = new Date('2026-11-16T00:00:00Z');

describe('computeCapStatus', () => {
  describe('No cap', () => {
    it('should never ask the agent to pause', () => {
      expect(computeCapStatus({ monthToDate: 99999n, cap: null })).toEqual({
        cap: null,
        capRemaining: null,
        overCap: false,
        shouldPause: false,
        percent: 0,
        projectedToHitCap: false,
        state: 'none',
      });
    });

    it('should treat a zero cap as no cap', () => {
      expect(computeCapStatus({ monthToDate: 100n, cap: 0n }).state).toBe('none');
    });
  });

  describe('With a cap', () => {
    it('should report remaining budget below the cap', () => {
      const status = computeCapStatus({ monthToDate: 10000n, cap: 30000n, now: MID_MONTH });
      expect(status).toMatchObject({
        cap: 30000n,
        capRemaining: 20000n,
        overCap: false,
        shouldPause: false,
        percent: 33,
        state: 'ok',
      });
    });

    it('should warn at 80% of the cap', () => {
      const status = computeCapStatus({ monthToDate: 24000n, cap: 30000n, now: MID_MONTH });
      expect(status.state).toBe('near');
      expect(status.percent).toBe(80);
      expect(status.shouldPause).toBe(false);
    });

    it('should pause exactly at the cap without being over it', () => {
      const status = computeCapStatus({ monthToDate: 30000n, cap: 30000n });
      expect(status).toMatchObject({
        capRemaining: 0n,
        overCap: false,
        shouldPause: true,
        percent: 100,
        state: 'reached',
      });
    });

    it('should floor remaining at zero when over the cap', () => {
      const status = computeCapStatus({ monthToDate: 30001n, cap: 30000n });
      expect(status).toMatchObject({
        capRemaining: 0n,
        overCap: true,
        shouldPause: true,
        state: 'over',
      });
    });

    it('should round the percent down', () => {
      expect(computeCapStatus({ monthToDate: 22899n, cap: 30000n }).percent).toBe(76);
    });
  });

  describe('Pace', () => {
    it('should project a month-end overrun from early spend', () => {
      // Half the month gone at 46% → 93% by month end; not yet hitting the cap.
      expect(
        computeCapStatus({ monthToDate: 14000n, cap: 30000n, now: MID_MONTH }).projectedToHitCap,
      ).toBe(false);
      // 60% by mid-month → over the cap by month end.
      expect(
        computeCapStatus({ monthToDate: 18000n, cap: 30000n, now: MID_MONTH }).projectedToHitCap,
      ).toBe(true);
    });

    it('should extrapolate linearly over the UTC month', () => {
      // 16 Nov 00:00 UTC is exactly 15 of November's 30 days.
      expect(projectMonthSpend(100n, new Date('2026-11-16T00:00:00Z'))).toBe(200n);
    });
  });
});

describe('pickKeyCurrency', () => {
  it('should prefer the cap currency, then the fallback, then the largest spend', () => {
    const spend = new Map([
      ['EUR', 500n],
      ['USD', 900n],
    ]);
    expect(pickKeyCurrency(spend, 'GBP', 'EUR')).toBe('GBP');
    expect(pickKeyCurrency(spend, null, 'EUR')).toBe('EUR');
    expect(pickKeyCurrency(spend, null)).toBe('USD');
    expect(pickKeyCurrency(undefined, null)).toBeNull();
  });
});

describe('buildAgentSpend', () => {
  const key = {
    id: 'k1',
    name: 'ci-key',
    agentLabel: 'Growth agent',
    model: 'claude-sonnet',
    monthlyCapAmount: 30000n,
    capCurrency: 'USD',
    group: { id: 7, name: 'Safi' },
  };

  it('should measure spend in the cap currency only and list the rest', () => {
    const spend = buildAgentSpend(
      key,
      new Map([
        ['USD', 22800n],
        ['EUR', 1000n],
      ]),
      MID_MONTH,
    );
    expect(spend).toMatchObject({
      apiKeyId: 'k1',
      label: 'Growth agent',
      currency: 'USD',
      monthToDate: 22800n,
      cap: 30000n,
      percent: 76,
      otherCurrencies: ['EUR'],
    });
  });

  it('should fall back to the key name and ignore a cap without a currency', () => {
    const spend = buildAgentSpend(
      { ...key, agentLabel: '  ', capCurrency: null },
      new Map([['USD', 100n]]),
    );
    expect(spend.label).toBe('ci-key');
    expect(spend.cap).toBeNull();
    expect(spend.state).toBe('none');
  });
});

describe('buildAgentSpend pause state', () => {
  const key = {
    id: 'k1',
    name: 'ci-key',
    agentLabel: null,
    model: null,
    monthlyCapAmount: 10000n,
    capCurrency: 'USD',
    group: null,
  };

  it('should not pause an active key under its cap', () => {
    const spend = buildAgentSpend(key, new Map([['USD', 1000n]]), MID_MONTH);
    expect(spend).toMatchObject({ paused: false, shouldPause: false, pauseReason: null });
    expect(spend.allowList).toEqual([]);
  });

  it('should pause a paused key even under its cap', () => {
    const pausedAt = new Date('2026-11-10T00:00:00Z');
    const spend = buildAgentSpend({ ...key, pausedAt }, new Map([['USD', 1000n]]), MID_MONTH);
    expect(spend).toMatchObject({
      paused: true,
      pausedAt,
      shouldPause: true,
      pauseReason: 'paused',
    });
    expect(spend.state).toBe('ok');
  });

  it('should give cap_reached at the cap', () => {
    const spend = buildAgentSpend(key, new Map([['USD', 10000n]]), MID_MONTH);
    expect(spend).toMatchObject({
      shouldPause: true,
      pauseReason: 'cap_reached',
      state: 'reached',
    });
  });
});

describe('agentsNeedingAttention', () => {
  const agent = (apiKeyId: string, monthToDate: bigint) =>
    buildAgentSpend(
      {
        id: apiKeyId,
        name: apiKeyId,
        agentLabel: null,
        model: null,
        monthlyCapAmount: 10000n,
        capCurrency: 'USD',
        group: null,
      },
      new Map([['USD', monthToDate]]),
      MID_MONTH,
    );

  it('should list over, then reached, then near agents and skip the rest', () => {
    const result = agentsNeedingAttention([
      agent('ok', 1000n),
      agent('near', 8500n),
      agent('reached', 10000n),
      agent('over', 12000n),
    ]);
    expect(result.map((item) => item.apiKeyId)).toEqual(['over', 'reached', 'near']);
  });
});

describe('cap input helpers', () => {
  it('should accept empty (no cap) or a positive decimal', () => {
    expect(isValidCapInput('')).toBe(true);
    expect(isValidCapInput(' 300 ')).toBe(true);
    expect(isValidCapInput('12,50')).toBe(true);
    expect(isValidCapInput('0')).toBe(false);
    expect(isValidCapInput('-5')).toBe(false);
    expect(isValidCapInput('abc')).toBe(false);
  });

  it('should format minor units for the input', () => {
    expect(minorToDecimal(30000n, 'USD')).toBe('300');
    expect(minorToDecimal(12345n, 'USD')).toBe('123.45');
    expect(minorToDecimal(500n, 'JPY')).toBe('500');
  });
});
