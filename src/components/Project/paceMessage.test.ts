import { describePace } from '~/server/project/budget';

import { monthEndLabel, paceMessage } from './paceMessage';

const money = (minor: bigint) => `$${(Number(minor) / 100).toFixed(2)}`;

describe('paceMessage', () => {
  describe('Audit scenario', () => {
    it('should say the projection and the overshoot in one sentence', () => {
      const pace = describePace({
        budget: 200000n,
        spent: 134600n,
        dayOfMonth: 12,
        daysInMonth: 30,
      });
      expect(paceMessage(pace, { money, monthEnd: '30 Nov' })).toEqual({
        key: 'audit_c.pace.at_risk',
        values: { projected: '$3365.00', date: '30 Nov', over: '$1365.00' },
        tone: 'warning',
      });
    });
  });

  it('should say what is left when on track', () => {
    const pace = describePace({ budget: 200000n, spent: 50000n, dayOfMonth: 15, daysInMonth: 30 });
    expect(paceMessage(pace, { money, monthEnd: '30 Nov' })).toEqual({
      key: 'audit_c.pace.on_track',
      values: { left: '$1500.00' },
      tone: 'success',
    });
  });

  it('should lead with the overshoot once over budget', () => {
    const pace = describePace({ budget: 100000n, spent: 120000n, dayOfMonth: 20, daysInMonth: 30 });
    expect(paceMessage(pace, { money, monthEnd: '30 Nov' })).toEqual({
      key: 'audit_c.pace.over',
      values: { over: '$200.00', projected: '$1800.00', date: '30 Nov' },
      tone: 'danger',
    });
  });

  describe('Early in the month', () => {
    it('should report spend so far instead of a projection', () => {
      const pace = describePace({
        budget: 200000n,
        spent: 134600n,
        dayOfMonth: 1,
        daysInMonth: 30,
      });
      expect(paceMessage(pace, { money, monthEnd: '30 Nov' })).toEqual({
        key: 'audit_f.pace.early',
        values: { spent: '$1346.00', left: '$654.00' },
        tone: 'neutral',
      });
    });

    it('should only say the overshoot when already over budget', () => {
      const pace = describePace({
        budget: 100000n,
        spent: 120000n,
        dayOfMonth: 2,
        daysInMonth: 30,
      });
      expect(paceMessage(pace, { money, monthEnd: '30 Nov' })).toEqual({
        key: 'audit_f.pace.over_early',
        values: { over: '$200.00' },
        tone: 'danger',
      });
    });
  });

  it('should say nothing without a budget', () => {
    expect(paceMessage({ kind: 'no_budget' }, { money, monthEnd: '' })).toBeNull();
  });
});

describe('monthEndLabel', () => {
  it('should name the last day of the month', () => {
    expect(monthEndLabel('en-GB', 2026, 10)).toBe('30 Nov');
    expect(monthEndLabel('en-GB', 2028, 1)).toBe('29 Feb');
  });
});
