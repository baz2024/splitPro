import { Button } from '@heroui/react';
import { Delete } from 'lucide-react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CurrencyCode } from '~/lib/currency';
import { useAddExpenseStore } from '~/store/addStore';

import { CurrencyPicker } from '../CurrencyPicker';

const MAX_INTEGER_DIGITS = 10;
const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const DIGITS = new Set<string>([...DIGIT_KEYS, '0']);

/** Amount-first entry: a large display with a numeric keypad, writing into the add store. */
export const AmountKeypad: React.FC<{
  onCurrencyPick: (currency: CurrencyCode | null) => void;
}> = ({ onCurrencyPick }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();
  const currency = useAddExpenseStore((s) => s.currency);
  const amountStr = useAddExpenseStore((s) => s.amountStr);
  const { setAmount, setAmountStr } = useAddExpenseStore((s) => s.actions);

  const { formatter, parseToCleanString, toSafeBigInt, format } =
    getCurrencyHelpersCached(currency);
  const decimalSeparator =
    formatter.formatToParts(1.1).find(({ type }) => 'decimal' === type)?.value ?? '.';
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;

  // The store may hold a formatted string (e.g. after a scan); work on the clean form.
  // A trailing separator ("12.") is kept so the next digit lands in the fraction.
  const isClean = amountStr
    .split('')
    .every((char) => DIGITS.has(char) || decimalSeparator === char);
  const clean = isClean ? amountStr : parseToCleanString(amountStr);

  const update = (next: string) => {
    setAmountStr(next);
    setAmount(toSafeBigInt(next));
  };

  const onKey = (key: string) => {
    const [integer = '', fraction] = clean.split(decimalSeparator);
    if (decimalSeparator === key) {
      if (0 === fractionDigits || undefined !== fraction) {
        return;
      }
      update(`${'' === integer ? '0' : integer}${decimalSeparator}`);
      return;
    }
    if (undefined !== fraction) {
      if (fraction.length >= fractionDigits) {
        return;
      }
      update(`${clean}${key}`);
      return;
    }
    if (integer.length >= MAX_INTEGER_DIGITS || ('0' === integer && '0' === key)) {
      return;
    }
    update('0' === integer ? key : `${integer}${key}`);
  };

  const onBackspace = () => update(clean.slice(0, -1));

  const display = '' === clean ? format('', { hideSymbol: true }) : clean;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-4">
        <CurrencyPicker currentCurrency={currency} onCurrencyPick={onCurrencyPick} />
        <p
          className="text-foreground text-center text-5xl font-semibold tracking-tight tabular-nums"
          aria-live="polite"
          aria-label={t('add_journey.manual.amount_label')}
        >
          {display}
        </p>
        <p className="text-muted text-sm">{t('add_journey.manual.amount_hint')}</p>
      </div>
      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label={t('add_journey.manual.keypad')}
      >
        {DIGIT_KEYS.map((key) => (
          <Button
            key={key}
            variant="tertiary"
            size="lg"
            className="h-14 text-2xl"
            onPress={() => onKey(key)}
          >
            {key}
          </Button>
        ))}
        <Button
          variant="tertiary"
          size="lg"
          className="h-14 text-2xl"
          isDisabled={0 === fractionDigits}
          onPress={() => onKey(decimalSeparator)}
          aria-label={t('add_journey.manual.decimal')}
        >
          {decimalSeparator}
        </Button>
        <Button variant="tertiary" size="lg" className="h-14 text-2xl" onPress={() => onKey('0')}>
          0
        </Button>
        <Button
          variant="tertiary"
          size="lg"
          className="h-14"
          onPress={onBackspace}
          aria-label={t('add_journey.manual.backspace')}
        >
          <Delete className="size-6 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
};
