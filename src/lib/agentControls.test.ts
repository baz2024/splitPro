import {
  capTone,
  checkAllowList,
  maskApiKey,
  normaliseAllowList,
  parseAllowListInput,
  relativeTimeParts,
  summarizeAgentSpend,
} from './agentControls';

describe('agentControls', () => {
  describe('capTone', () => {
    it('should have no tone without a cap', () => {
      expect(capTone({ percent: 250, hasCap: false })).toBe('none');
    });

    it.each([
      [0, 'success'],
      [79, 'success'],
      [80, 'warning'],
      [99, 'warning'],
      [100, 'danger'],
      [180, 'danger'],
    ] as const)('should colour %i%% as %s', (percent, tone) => {
      expect(capTone({ percent, hasCap: true })).toBe(tone);
    });
  });

  describe('allow-list', () => {
    it('should normalise entries and drop blanks and duplicates', () => {
      expect(normaliseAllowList([' Anthropic ', '', 'anthropic', 'GPT-4o*'])).toEqual([
        'anthropic',
        'gpt-4o*',
      ]);
      expect(parseAllowListInput('anthropic, gpt-4o*\nclaude-sonnet')).toEqual([
        'anthropic',
        'gpt-4o*',
        'claude-sonnet',
      ]);
    });

    it('should allow anything when the list is empty', () => {
      expect(checkAllowList([], { service: 'openai', model: 'gpt-4o' })).toEqual({
        allowed: true,
        reason: null,
      });
      expect(checkAllowList(undefined, { service: 'openai' }).allowed).toBe(true);
    });

    it('should allow every model of a listed provider', () => {
      expect(
        checkAllowList(['anthropic'], { service: 'Anthropic', model: 'claude-opus' }).allowed,
      ).toBe(true);
    });

    it('should match providers by catalog name as well as id', () => {
      expect(checkAllowList(['GitHub'], { service: 'github-copilot' }).allowed).toBe(true);
    });

    it('should allow an exact model or a model prefix ending in *', () => {
      expect(
        checkAllowList(['claude-sonnet-4-5'], { service: 'anthropic', model: 'Claude-Sonnet-4-5' })
          .allowed,
      ).toBe(true);
      expect(checkAllowList(['gpt-4o*'], { service: 'openai', model: 'gpt-4o-mini' }).allowed).toBe(
        true,
      );
      expect(checkAllowList(['gpt-4o*'], { service: 'openai', model: 'gpt-5' }).allowed).toBe(
        false,
      );
    });

    it('should reject a provider and model outside the list with a reason', () => {
      const result = checkAllowList(['anthropic'], { service: 'openai', model: 'gpt-4o' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('openai / gpt-4o');
      expect(result.reason).toContain('anthropic');
    });

    it('should reject when only models are listed and the report has no model', () => {
      expect(checkAllowList(['claude-*'], { service: 'anthropic' }).allowed).toBe(false);
    });
  });

  describe('maskApiKey', () => {
    it('should show the prefix and last four', () => {
      expect(maskApiKey('safi_AbC', 'wxyz')).toBe('safi_AbC…wxyz');
    });

    it('should show only the prefix for older keys', () => {
      expect(maskApiKey('safi_AbC', null)).toBe('safi_AbC…');
    });
  });

  describe('summarizeAgentSpend', () => {
    it('should compare capped agents with the sum of their caps', () => {
      const totals = summarizeAgentSpend([
        { currency: 'USD', monthToDate: 12000n, cap: 30000n },
        { currency: 'USD', monthToDate: 5000n, cap: 10000n },
        { currency: 'USD', monthToDate: 2500n, cap: null },
      ]);
      expect(totals).toEqual({
        currency: 'USD',
        spent: 19500n,
        cappedSpent: 17000n,
        capTotal: 40000n,
        agentCount: 3,
        cappedCount: 2,
        excludedCount: 0,
      });
    });

    it('should hide the cap when no agent has one', () => {
      const totals = summarizeAgentSpend([{ currency: 'USD', monthToDate: 100n, cap: null }]);
      expect(totals.capTotal).toBeNull();
      expect(totals.spent).toBe(100n);
    });

    it('should sum one currency and count the others as excluded', () => {
      const totals = summarizeAgentSpend([
        { currency: 'USD', monthToDate: 100n, cap: 1000n },
        { currency: 'USD', monthToDate: 200n, cap: null },
        { currency: 'EUR', monthToDate: 900n, cap: 5000n },
      ]);
      expect(totals.currency).toBe('USD');
      expect(totals.spent).toBe(300n);
      expect(totals.capTotal).toBe(1000n);
      expect(totals.excludedCount).toBe(1);
    });

    it('should have no currency with no agents', () => {
      expect(summarizeAgentSpend([]).currency).toBeNull();
    });
  });

  describe('relativeTimeParts', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms);

    it('should say just now under a minute', () => {
      expect(relativeTimeParts(ago(30_000), now)).toBeNull();
    });

    it.each([
      [4 * 60_000, { value: 4, unit: 'minute' }],
      [3 * 60 * 60_000, { value: 3, unit: 'hour' }],
      [50 * 60 * 60_000, { value: 2, unit: 'day' }],
    ] as const)('should turn %i ms into %o', (ms, expected) => {
      expect(relativeTimeParts(ago(ms), now)).toEqual(expected);
    });
  });
});
