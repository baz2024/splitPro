import { formatMoneyParts, moneyToString } from '~/components/Safi/Money';

describe('formatMoneyParts', () => {
  describe('cents', () => {
    it('should split whole units and cents', () => {
      const parts = formatMoneyParts({ amount: 197844n, currency: 'USD', locale: 'en' });
      expect(moneyToString(parts)).toBe('$1,978.44');
      expect(parts.find((part) => 'cents' === part.type)?.value).toBe('44');
      expect(parts.find((part) => 'whole' === part.type)?.value).toBe('1,978');
    });

    it('should drop the sign unless asked for it', () => {
      expect(moneyToString(formatMoneyParts({ amount: -1050n, currency: 'USD' }))).toBe('$10.50');
      expect(
        moneyToString(formatMoneyParts({ amount: -1050n, currency: 'USD', signed: true })),
      ).toBe('-$10.50');
    });

    it('should treat the "default" locale as English', () => {
      expect(
        moneyToString(formatMoneyParts({ amount: 5n, currency: 'USD', locale: 'default' })),
      ).toBe('$0.05');
    });
  });

  describe('micro-costs', () => {
    it('should grey digits past the cents', () => {
      const parts = formatMoneyParts({ amount: 4200n, currency: 'USD', precision: 6 });
      expect(moneyToString(parts)).toBe('$0.0042');
      expect(parts.find((part) => 'subcent' === part.type)?.value).toBe('42');
    });

    it('should omit sub-cent digits that are all zero', () => {
      const parts = formatMoneyParts({ amount: 1_230_000n, currency: 'USD', precision: 6 });
      expect(moneyToString(parts)).toBe('$1.23');
      expect(parts.some((part) => 'subcent' === part.type)).toBe(false);
    });
  });
});
