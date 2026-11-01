import { pickHeadline } from '~/components/Safi/BalanceHeadline';
import { resolveEffectiveCurrency } from '~/components/Layout/ToolbarSwitchers';

const dana = { id: 2, name: 'Dana', email: 'dana@example.com' };
const sam = { id: 3, name: 'Sam', email: 'sam@example.com' };

describe('pickHeadline', () => {
  describe('settled', () => {
    it('should say settled when nothing is owed either way', () => {
      expect(pickHeadline({ youGet: [], youOwe: [], balances: [] })).toEqual({ kind: 'settled' });
    });
  });

  describe('one side', () => {
    it('should name the only friend who owes you', () => {
      const result = pickHeadline({
        youGet: [{ currency: 'USD', amount: 197844n }],
        youOwe: [],
        balances: [{ friend: dana, currencies: [{ currency: 'USD', amount: 197844n }] }],
      });
      expect(result).toEqual({
        kind: 'owed',
        amounts: [{ currency: 'USD', amount: 197844n }],
        friend: dana,
      });
    });

    it('should not name anyone when several people are involved', () => {
      const result = pickHeadline({
        youGet: [],
        youOwe: [{ currency: 'USD', amount: -500n }],
        balances: [
          { friend: dana, currencies: [{ currency: 'USD', amount: -200n }] },
          { friend: sam, currencies: [{ currency: 'USD', amount: -300n }] },
        ],
      });
      expect(result).toEqual({
        kind: 'owe',
        amounts: [{ currency: 'USD', amount: 500n }],
        friend: null,
      });
    });
  });

  describe('both sides', () => {
    it('should report owed and owe separately', () => {
      const result = pickHeadline({
        youGet: [{ currency: 'EUR', amount: 1000n }],
        youOwe: [{ currency: 'USD', amount: -250n }],
      });
      expect(result).toEqual({
        kind: 'mixed',
        owed: [{ currency: 'EUR', amount: 1000n }],
        owe: [{ currency: 'USD', amount: 250n }],
      });
    });
  });
});

describe('resolveEffectiveCurrency', () => {
  it('should prefer the user default, then the session preference, then USD', () => {
    expect(resolveEffectiveCurrency('EUR', 'GBP')).toBe('EUR');
    expect(resolveEffectiveCurrency(null, 'GBP')).toBe('GBP');
    expect(resolveEffectiveCurrency(null, '__SHOW_ALL__')).toBe('USD');
    expect(resolveEffectiveCurrency(undefined, undefined)).toBe('USD');
  });
});
