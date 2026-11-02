import { useTranslation } from 'next-i18next';
import React from 'react';

import { CURRENCIES, isCurrencyCode } from '~/lib/currency';
import { cn } from '~/lib/utils';

export type MoneyTone = 'owed' | 'owe' | 'neutral' | 'warn';

export interface MoneyPart {
  type: 'sign' | 'currency' | 'whole' | 'decimal' | 'cents' | 'subcent' | 'literal';
  value: string;
}

const TONE_CLASSES: Record<MoneyTone, string> = {
  owed: 'text-positive',
  owe: 'text-negative',
  warn: 'text-warning',
  neutral: '',
};

const PART_CLASSES: Record<MoneyPart['type'], string> = {
  sign: '',
  currency: '',
  whole: '',
  literal: '',
  decimal: 'text-[0.72em]',
  cents: 'text-[0.72em]',
  subcent: 'text-[0.72em] text-muted font-normal',
};

const toIntlLocale = (locale?: string) => (!locale || 'default' === locale ? 'en' : locale);

const makeFormatter = (locale: string, currency: string, fractionDigits: number) => {
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  };
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    return new Intl.NumberFormat('en', options);
  }
};

/**
 * Splits a minor-unit amount into display parts: whole units, cents, and any sub-cent digits.
 *
 * `precision` is how many decimals `amount` carries. It defaults to the currency's own digits
 * (cents); pass a larger one (e.g. 6 for micro-dollars) for API micro-costs, whose digits past
 * the cents come back as a separate `subcent` part with trailing zeros trimmed.
 */
export const formatMoneyParts = ({
  amount,
  currency,
  locale,
  precision,
  signed = false,
}: {
  amount: bigint;
  currency: string;
  locale?: string;
  precision?: number;
  signed?: boolean;
}): MoneyPart[] => {
  const code = isCurrencyCode(currency) ? currency : 'USD';
  const currencyDigits = CURRENCIES[code].decimalDigits;
  const digits = Math.max(precision ?? currencyDigits, currencyDigits);
  const intlLocale = toIntlLocale(locale);

  const absolute = 0n > amount ? -amount : amount;
  const divisor = 10n ** BigInt(digits);
  const whole = absolute / divisor;
  const fraction = `${absolute % divisor}`.padStart(digits, '0');
  const centsDigits = fraction.slice(0, currencyDigits);
  const subcentDigits = fraction.slice(currencyDigits).replace(/0+$/, '');

  // Renders digits in the locale's numbering system ("٤٢" in Arabic).
  const digitFormatter = new Intl.NumberFormat(intlLocale, { useGrouping: false });
  const localiseDigits = (text: string) =>
    text.replace(/[0-9]/g, (digit) => digitFormatter.format(Number(digit)));

  const formatter = makeFormatter(intlLocale, code, currencyDigits);
  const parts: MoneyPart[] = [];

  if (signed && 0n > amount) {
    parts.push({ type: 'sign', value: '-' });
  }

  formatter.formatToParts(whole).forEach((part) => {
    if ('integer' === part.type || 'group' === part.type) {
      const last = parts.at(-1);
      if ('whole' === last?.type) {
        last.value += part.value;
      } else {
        parts.push({ type: 'whole', value: part.value });
      }
      return;
    }
    if ('decimal' === part.type) {
      parts.push({ type: 'decimal', value: part.value });
      return;
    }
    if ('fraction' === part.type) {
      parts.push({ type: 'cents', value: localiseDigits(centsDigits) });
      if ('' !== subcentDigits) {
        parts.push({ type: 'subcent', value: localiseDigits(subcentDigits) });
      }
      return;
    }
    if ('currency' === part.type) {
      parts.push({ type: 'currency', value: part.value });
      return;
    }
    if ('minusSign' === part.type || 'plusSign' === part.type) {
      return;
    }
    parts.push({ type: 'literal', value: part.value });
  });

  return parts;
};

export const moneyToString = (parts: MoneyPart[]) => parts.map((part) => part.value).join('');

export interface MoneyProps {
  /** Amount in minor units (cents), or in `precision` decimals when given. */
  amount: bigint;
  currency: string;
  /** Colour for the number only: green owed to you, red you owe, amber due soon. */
  tone?: MoneyTone;
  /** Decimals carried by `amount`; larger than the currency's shows greyed sub-cent digits. */
  precision?: number;
  /** Show a minus sign for negative amounts (off by default: copy usually says who owes). */
  signed?: boolean;
  className?: string;
}

/**
 * One way to show money across Safi: tabular figures, smaller cents, greyed sub-cent digits
 * for API micro-costs, and colour on the number only.
 */
export const Money: React.FC<MoneyProps> = ({
  amount,
  currency,
  tone = 'neutral',
  precision,
  signed = false,
  className,
}) => {
  const { i18n } = useTranslation();
  const parts = formatMoneyParts({ amount, currency, locale: i18n.language, precision, signed });

  // <bdi dir="ltr"> isolates the amount, so "US$ 25" keeps its order inside Arabic sentences.
  return (
    <bdi
      dir="ltr"
      className={cn('font-semibold whitespace-nowrap tabular-nums', TONE_CLASSES[tone], className)}
    >
      {parts.map((part, index) => (
        // oxlint-disable-next-line no-array-index-key -- parts are positional and never reorder.
        <span key={index} className={PART_CLASSES[part.type] || undefined}>
          {part.value}
        </span>
      ))}
    </bdi>
  );
};
