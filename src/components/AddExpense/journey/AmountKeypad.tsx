import { Spinner } from '@heroui/react';
import { Camera, Check, ChevronDown, Delete } from 'lucide-react';
import React, { useRef } from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CurrencyCode } from '~/lib/currency';
import { useAddExpenseStore } from '~/store/addStore';

import { CategoryRow, DescriptionRow, RepeatLink } from './ExpenseDetailsStep';
import { CurrencySheet, DatePopover } from './journeyPickers';
import { GroupedRows, RowButton } from './journeyUi';

const MAX_INTEGER_DIGITS = 10;
const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const DIGITS = new Set<string>([...DIGIT_KEYS, '0']);

const KEY_CLASS =
  'bg-surface hover:bg-surface-secondary active:bg-surface-tertiary focus-visible:ring-focus flex h-12 items-center justify-center rounded-xl text-xl font-medium outline-none focus-visible:ring-2 disabled:opacity-40';

/** "Attach receipt photo (optional)" accent link with upload state. */
const AttachReceiptLink: React.FC<{ onAttach: (file: File) => void }> = ({ onAttach }) => {
  const { t } = useTranslationWithUtils();
  const fileKey = useAddExpenseStore((s) => s.fileKey);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const inputRef = useRef<HTMLInputElement>(null);

  const label = isFileUploading
    ? t('add_journey.manual.uploading')
    : fileKey
      ? t('add_journey.manual.attached')
      : t('add_journey.manual.attach');

  return (
    <>
      <button
        type="button"
        disabled={isFileUploading}
        onClick={() => inputRef.current?.click()}
        className="text-accent focus-visible:ring-focus flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium outline-none focus-visible:ring-2"
      >
        {isFileUploading ? (
          <Spinner size="sm" color="accent" />
        ) : fileKey ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Camera className="size-4" aria-hidden />
        )}
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            onAttach(file);
          }
        }}
      />
    </>
  );
};

/**
 * Screen 4: amount-first manual entry — big amount, currency, What for? / Category / Date rows,
 * optional receipt photo and a numeric keypad, all writing into the add store.
 */
export const AmountKeypad: React.FC<{
  onCurrencyPick: (currency: CurrencyCode | null) => void;
  onAttach: (file: File) => void;
}> = ({ onCurrencyPick, onAttach }) => {
  const { t, toUIDate, getCurrencyHelpersCached } = useTranslationWithUtils();
  const currency = useAddExpenseStore((s) => s.currency);
  const amountStr = useAddExpenseStore((s) => s.amountStr);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);
  const { setAmount, setAmountStr, setExpenseDate } = useAddExpenseStore((s) => s.actions);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 py-4">
        <p
          dir="ltr"
          className="text-foreground text-center text-6xl font-bold tracking-tight tabular-nums"
          aria-live="polite"
          aria-label={t('add_journey.manual.amount_label')}
        >
          {format(clean, {})}
        </p>
        <CurrencySheet
          currency={currency}
          onPick={onCurrencyPick}
          trigger={
            <button
              type="button"
              aria-label={`${t('add_journey.manual.change_currency')}: ${currency}`}
              className="text-muted hover:text-foreground focus-visible:ring-focus flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm outline-none focus-visible:ring-2"
            >
              {currency}
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
          }
        />
      </div>

      <GroupedRows>
        <DescriptionRow
          label={t('add_journey.manual.what_for')}
          placeholder={t('add_journey.manual.what_for_placeholder')}
        />
        <CategoryRow label={t('add_journey.review.fields.category')} />
        <DatePopover
          date={expenseDate}
          onPick={setExpenseDate}
          trigger={
            <RowButton label={t('add_journey.review.fields.date')}>
              {toUIDate(expenseDate, { useToday: true })}
            </RowButton>
          }
        />
      </GroupedRows>

      <div className="flex items-center justify-between gap-2">
        <AttachReceiptLink onAttach={onAttach} />
        <RepeatLink />
      </div>

      <div
        dir="ltr"
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label={t('add_journey.manual.keypad')}
      >
        {DIGIT_KEYS.map((key) => (
          <button key={key} type="button" className={KEY_CLASS} onClick={() => onKey(key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          className={KEY_CLASS}
          disabled={0 === fractionDigits}
          onClick={() => onKey(decimalSeparator)}
          aria-label={t('add_journey.manual.decimal')}
        >
          {decimalSeparator}
        </button>
        <button type="button" className={KEY_CLASS} onClick={() => onKey('0')}>
          0
        </button>
        <button
          type="button"
          className={KEY_CLASS}
          onClick={onBackspace}
          aria-label={t('add_journey.manual.backspace')}
        >
          <Delete className="size-6" aria-hidden />
        </button>
      </div>
    </div>
  );
};
