import { CURRENCIES, type CurrencyCode } from '~/lib/currency';

const DECIMAL_PATTERN = /^\d{1,12}(?:\.\d+)?$/;

/** Minor units → plain decimal string for the cap input ("30000n" USD → "300"). */
export const minorToDecimal = (amount: bigint, currency: CurrencyCode): string => {
  const { decimalDigits } = CURRENCIES[currency];
  if (0 === decimalDigits) {
    return amount.toString();
  }
  const scale = 10n ** BigInt(decimalDigits);
  const fraction = (amount % scale).toString().padStart(decimalDigits, '0').replace(/0+$/, '');
  return '' === fraction ? `${amount / scale}` : `${amount / scale}.${fraction}`;
};

/** Empty means "no cap"; otherwise a positive decimal. */
export const isValidCapInput = (value: string): boolean => {
  const normalized = value.trim().replace(',', '.');
  return '' === normalized || (DECIMAL_PATTERN.test(normalized) && 0 < Number(normalized));
};
