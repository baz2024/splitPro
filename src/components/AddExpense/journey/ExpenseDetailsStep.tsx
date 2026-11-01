import { AlertTriangle, ChevronDown, ImageIcon, RefreshCcwDot, Sparkles } from 'lucide-react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CurrencyCode } from '~/lib/currency';
import { cn } from '~/lib/utils';
import { useAddExpenseStore } from '~/store/addStore';
import { toImageSrc } from '~/utils/imageUpload';

import { RecurrenceInput } from '../RecurrenceInput';
import { PaidBySentence } from './PaidBySentence';
import { CategorySheet, CurrencySheet, DatePopover, categoryLabel } from './journeyPickers';
import { GroupedRows, RowButton, ValueRow } from './journeyUi';
import { type ScanField } from './receiptScan';

/** Description row with an inline, end-aligned text field. */
export const DescriptionRow: React.FC<{
  label: string;
  placeholder: string;
  flagged?: boolean;
}> = ({ label, placeholder, flagged = false }) => {
  const description = useAddExpenseStore((s) => s.description);
  const { setDescription } = useAddExpenseStore((s) => s.actions);
  const id = React.useId();

  return (
    <div
      className={cn(
        'focus-within:ring-focus flex min-h-13 items-center justify-between gap-3 px-4 py-1 text-sm focus-within:ring-2 focus-within:ring-inset',
        flagged && 'bg-warning/10',
      )}
    >
      <label htmlFor={id} className="text-muted shrink-0">
        {label}
      </label>
      <input
        id={id}
        value={description}
        placeholder={placeholder}
        onChange={(e) => setDescription(e.target.value)}
        className="text-foreground placeholder:text-muted min-h-11 min-w-0 flex-1 bg-transparent text-end font-medium outline-none"
      />
    </div>
  );
};

/** Category row opening the category sheet. */
export const CategoryRow: React.FC<{ label: string; flagged?: boolean }> = ({
  label,
  flagged = false,
}) => {
  const { t } = useTranslationWithUtils(['common', 'categories']);
  const category = useAddExpenseStore((s) => s.category);
  const { setCategory } = useAddExpenseStore((s) => s.actions);

  return (
    <CategorySheet
      category={category}
      onPick={setCategory}
      trigger={
        <RowButton label={label} flagged={flagged}>
          {categoryLabel(t, category)}
        </RowButton>
      }
    />
  );
};

/** Small accent link that opens the existing recurrence sheet. */
export const RepeatLink: React.FC = () => {
  const { t } = useTranslationWithUtils();
  const cronExpression = useAddExpenseStore((s) => s.cronExpression);

  return (
    <RecurrenceInput>
      <button
        type="button"
        className={cn(
          'focus-visible:ring-focus flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm outline-none focus-visible:ring-2',
          cronExpression ? 'text-accent font-medium' : 'text-muted',
        )}
      >
        <RefreshCcwDot className="size-4" aria-hidden />
        {cronExpression ? t('add_journey.review.repeat_on') : t('add_journey.review.repeat_off')}
      </button>
    </RecurrenceInput>
  );
};

/**
 * Screen 3: "Review expense" after a scan. Edits the shared add store directly.
 */
export const ExpenseDetailsStep: React.FC<{
  lowConfidenceFields?: ScanField[];
  note?: string | null;
  receiptPreviewUrl?: string | null;
  fromPhoto?: boolean;
  onEditAmount: () => void;
  onSplitPress: () => void;
  onCurrencyPick: (currency: CurrencyCode | null) => void;
}> = ({
  lowConfidenceFields = [],
  note,
  receiptPreviewUrl,
  fromPhoto = false,
  onEditAmount,
  onSplitPress,
  onCurrencyPick,
}) => {
  const { t, toUIDate, getCurrencyHelpersCached } = useTranslationWithUtils();
  const amount = useAddExpenseStore((s) => s.amount);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const currency = useAddExpenseStore((s) => s.currency);
  const description = useAddExpenseStore((s) => s.description);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);
  const fileKey = useAddExpenseStore((s) => s.fileKey);
  const group = useAddExpenseStore((s) => s.group);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const { setExpenseDate } = useAddExpenseStore((s) => s.actions);

  const flagged = new Set(lowConfidenceFields);
  const amountFlagged = flagged.has('amount');
  const receiptSrc = receiptPreviewUrl ?? toImageSrc(fileKey);
  const warning =
    note ??
    (0 < flagged.size
      ? t('add_journey.review.warning_pill', {
          fields: [...flagged].map((field) => t(`add_journey.review.fields.${field}`)).join(', '),
        })
      : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="bg-surface-secondary border-border flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
          {receiptSrc ? (
            // oxlint-disable-next-line next/no-img-element -- local blob/preview URLs
            <img
              src={receiptSrc}
              alt={t('expense_details.receipt.thumbnail_alt')}
              className={cn('size-full object-cover', isFileUploading && 'opacity-50')}
            />
          ) : (
            <ImageIcon className="text-muted size-6" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <button
            type="button"
            onClick={onEditAmount}
            aria-label={t('add_journey.review.edit_amount')}
            className={cn(
              'focus-visible:ring-focus min-h-11 rounded-lg text-start outline-none focus-visible:ring-2',
              amountFlagged && 'text-warning',
            )}
          >
            <span dir="ltr" className="text-4xl font-bold tracking-tight tabular-nums">
              {getCurrencyHelpersCached(currency).toUIString(
                amount * (isNegative ? -1n : 1n),
                true,
              )}
            </span>
          </button>
          <p className="text-muted flex min-w-0 flex-wrap items-center gap-x-1 text-sm">
            <span className="truncate">
              {description.trim() || t('add_journey.review.untitled')}
            </span>
            <span aria-hidden>·</span>
            <DatePopover
              date={expenseDate}
              onPick={setExpenseDate}
              trigger={
                <button
                  type="button"
                  aria-label={`${t('add_journey.review.edit_date')}: ${toUIDate(expenseDate, { year: true })}`}
                  className={cn(
                    'focus-visible:ring-focus min-h-11 rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2',
                    flagged.has('date') && 'text-warning',
                  )}
                >
                  {toUIDate(expenseDate, { year: true })}
                </button>
              }
            />
          </p>
          {fromPhoto ? (
            <span className="text-accent flex items-center gap-1 text-xs font-medium">
              <Sparkles className="size-3" aria-hidden />
              {t('add_journey.review.filled_from_photo')}
            </span>
          ) : null}
        </div>
      </div>

      <GroupedRows>
        <DescriptionRow
          label={t('add_journey.review.fields.merchant')}
          placeholder={t('expense_details.add_expense_details.description_placeholder')}
          flagged={flagged.has('merchant')}
        />
        <CategoryRow
          label={t('add_journey.review.fields.category')}
          flagged={flagged.has('category')}
        />
        <ValueRow label={t('add_journey.review.project')}>
          {group ? (
            <span className="truncate">{group.name}</span>
          ) : (
            <span className="text-muted font-normal">{t('add_journey.review.no_project')}</span>
          )}
        </ValueRow>
        <CurrencySheet
          currency={currency}
          onPick={onCurrencyPick}
          trigger={
            <RowButton
              label={t('add_journey.review.fields.currency')}
              flagged={flagged.has('currency')}
            >
              {currency}
              <ChevronDown className="text-muted size-4" aria-hidden />
            </RowButton>
          }
        />
      </GroupedRows>

      {warning ? (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 text-warning flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>{warning}</span>
        </div>
      ) : null}

      <div className="flex justify-end">
        <RepeatLink />
      </div>

      <PaidBySentence onSplitPress={onSplitPress} />
    </div>
  );
};
