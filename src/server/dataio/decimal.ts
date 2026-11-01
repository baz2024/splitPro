import { CURRENCIES, isCurrencyCode } from '~/lib/currency';

/** Minor-unit digits for a currency code (2 when unknown). */
export const currencyDigits = (currency: string): number =>
  isCurrencyCode(currency) ? CURRENCIES[currency].decimalDigits : 2;

/** Exact BigInt minor units → decimal string ("1234" with 2 digits → "12.34"). No floats. */
export const minorToDecimal = (amount: bigint, digits: number): string => {
  const negative = 0n > amount;
  const abs = negative ? -amount : amount;
  const sign = negative ? '-' : '';
  if (0 >= digits) {
    return `${sign}${abs}`;
  }
  const base = 10n ** BigInt(digits);
  const fraction = (abs % base).toString().padStart(digits, '0');
  return `${sign}${abs / base}.${fraction}`;
};

export type DecimalResult =
  | { ok: true; value: bigint }
  | { ok: false; error: 'invalid_amount' | 'too_many_decimals' };

const MAX_INTEGER_DIGITS = 15;

/** Arabic-Indic and Persian digits → ASCII; Arabic decimal/thousands marks → "." / removed. */
const toAsciiDigits = (value: string) =>
  value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, '');

const countOf = (value: string, char: string) => value.split(char).length - 1;

/** Decide which of "," and "." is the decimal separator and return "digits[.digits]". */
const normaliseSeparators = (body: string, digits: number): string | null => {
  const hasDot = body.includes('.');
  const hasComma = body.includes(',');
  if (hasDot && hasComma) {
    const decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
    const thousands = '.' === decimal ? ',' : '.';
    if (1 < countOf(body, decimal)) {
      return null;
    }
    return body.split(thousands).join('').replace(decimal, '.');
  }
  const separator = hasDot ? '.' : hasComma ? ',' : null;
  if (null === separator) {
    return body;
  }
  if (1 < countOf(body, separator)) {
    // "1,234,567" or "1.234.567": grouping only, every group must be 3 digits.
    const [head = '', ...groups] = body.split(separator);
    return '' !== head && groups.every((group) => 3 === group.length)
      ? [head, ...groups].join('')
      : null;
  }
  const [head = '', tail = ''] = body.split(separator);
  // "1,234" reads as thousands; "1.234" as a decimal unless the currency has no minor units.
  const isGrouping = 3 === tail.length && '' !== head && (',' === separator || 0 === digits);
  return isGrouping ? `${head}${tail}` : `${head}.${tail}`;
};

/**
 * Parse a human-written amount into exact minor units. Accepts thousands separators, "," or
 * "." decimals, Arabic-Indic digits, currency symbols/codes, leading/trailing minus and
 * accounting parentheses. Extra fraction digits are only accepted when they are zeros.
 */
export const decimalToMinor = (raw: string, digits: number): DecimalResult => {
  // Scientific notation would lose its exponent once letters are stripped.
  if (/\d\s*e\s*[+-]?\d/i.test(raw)) {
    return { ok: false, error: 'invalid_amount' };
  }
  // Strip currency symbols and codes anywhere, e.g. "$12", "12 USD", "د.ا 5", "Rs.100".
  let value = toAsciiDigits(raw.normalize('NFKC'))
    .replace(/\p{L}+(?:\.\p{L}+)*\.?/gu, '')
    .replace(/[\p{Sc}\s\u00a0\u202f']/gu, '')
    .replace(/\u2212/g, '-');
  let negative = false;
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.startsWith('-') || value.endsWith('-')) {
    negative = !negative;
    value = value.startsWith('-') ? value.slice(1) : value.slice(0, -1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }
  if (!/^[\d.,]+$/.test(value) || !/\d/.test(value)) {
    return { ok: false, error: 'invalid_amount' };
  }
  const normalised = normaliseSeparators(value, digits);
  if (null === normalised) {
    return { ok: false, error: 'invalid_amount' };
  }
  const [integerPart = '', fractionPart = ''] = normalised.split('.');
  const integer = integerPart.replace(/^0+(?=\d)/, '') || '0';
  if (MAX_INTEGER_DIGITS < integer.length) {
    return { ok: false, error: 'invalid_amount' };
  }
  const kept = fractionPart.slice(0, digits);
  if (/[^0]/.test(fractionPart.slice(digits))) {
    return { ok: false, error: 'too_many_decimals' };
  }
  const minor = BigInt(`${integer}${kept.padEnd(digits, '0')}`);
  return { ok: true, value: negative ? -minor : minor };
};
