import { AlertTriangle, ChevronDown, ImageIcon, RefreshCcwDot, Sparkles } from 'lucide-react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CurrencyCode } from '~/lib/currency';
import { parseReviewReasons } from '~/lib/expenseReview';
import { cn } from '~/lib/utils';
import { useAddExpenseStore } from '~/store/addStore';
import { toImageSrc } from '~/utils/imageUpload';

import { RecurrenceInput } from '../RecurrenceInput';
import { useReviewTranslation } from '../../Review/useReviewTranslation';
import { PaidBySentence } from './PaidBySentence';
import { CategorySheet, CurrencySheet, DatePopover, categoryLabel } from './journeyPickers';
import { GroupedRows, JOURNEY_PILL_CLASS, RowButton, ValueRow } from './journeyUi';
import { type ScanField, confirmationFlags } from './receiptScan';

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
export const RepeatLink: React.FC<{
  /** Compact pill (manual entry row) instead of a plain text link. */
  pill?: boolean;
}> = ({ pill = false }) => {
  const { t } = useTranslationWithUtils();
  const cronExpression = useAddExpenseStore((s) => s.cronExpression);

  return (
    <RecurrenceInput>
      <button
        type="button"
        className={cn(
          pill
            ? cn(JOURNEY_PILL_CLASS, 'shrink-0')
            : 'focus-visible:ring-focus flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm outline-none focus-visible:ring-2',
          cronExpression ? 'text-accent font-medium' : 'text-muted',
        )}
      >
        <RefreshCcwDot className="size-4 shrink-0" aria-hidden />
        {cronExpression ? t('add_journey.review.repeat_on') : t('add_journey.review.repeat_off')}
      </button>
    </RecurrenceInput>
  );
};

/** Small amber "Check" tag on a field the AI was unsure about. */
const CheckTag: React.FC = () => {
  const { t } = useTranslationWithUtils();
  return (
    <span className="bg-warning/20 text-warning inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
      <AlertTriangle className="size-3" aria-hidden />
      {t('audit_c.scan.check')}
    </span>
  );
};

/**
 * What the receipt scanner understood: amount, merchant, date and category on one card, right
 * after the scan. Fields the AI was unsure of are amber with a "Check" tag; every row is one
 * tap from its editor (keypad, inline text, calendar, category sheet).
 */
const ScanConfirmationCard: React.FC<{
  flagged: Set<ScanField>;
  receiptSrc: string | null | undefined;
  onEditAmount: () => void;
}> = ({ flagged, receiptSrc, onEditAmount }) => {
  const { t, toUIDate, getCurrencyHelpersCached } = useTranslationWithUtils([
    'common',
    'categories',
  ]);
  const amount = useAddExpenseStore((s) => s.amount);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const currency = useAddExpenseStore((s) => s.currency);
  const description = useAddExpenseStore((s) => s.description);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);
  const category = useAddExpenseStore((s) => s.category);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const { setDescription, setExpenseDate, setCategory } = useAddExpenseStore((s) => s.actions);
  const merchantId = React.useId();
  const unsureCount = (['amount', 'merchant', 'date', 'category'] as const).filter((field) =>
    flagged.has(field),
  ).length;

  return (
    <section
      aria-labelledby="scan-confirm-title"
      className="bg-surface border-border flex flex-col overflow-hidden rounded-2xl border"
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="bg-surface-secondary border-border flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
          {receiptSrc ? (
            // oxlint-disable-next-line next/no-img-element -- local blob/preview URLs
            <img
              src={receiptSrc}
              alt={t('expense_details.receipt.thumbnail_alt')}
              className={cn('size-full object-cover', isFileUploading && 'opacity-50')}
            />
          ) : (
            <ImageIcon className="text-muted size-5" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <h2 id="scan-confirm-title" className="text-sm font-semibold">
            {t('audit_c.scan.title')}
          </h2>
          <p
            className={cn(
              'flex items-center gap-1 text-xs',
              0 < unsureCount ? 'text-warning' : 'text-accent',
            )}
          >
            {0 < unsureCount ? (
              <AlertTriangle className="size-3" aria-hidden />
            ) : (
              <Sparkles className="size-3" aria-hidden />
            )}
            {0 < unsureCount
              ? t('audit_c.scan.check_count', { count: unsureCount })
              : t('audit_c.scan.all_clear')}
          </p>
        </div>
      </div>

      <div className="divide-separator border-border flex flex-col divide-y border-t">
        <RowButton
          label={t('add_journey.review.fields.amount')}
          flagged={flagged.has('amount')}
          onClick={onEditAmount}
          aria-label={t('add_journey.review.edit_amount')}
        >
          {flagged.has('amount') ? <CheckTag /> : null}
          <span dir="ltr" className="text-lg font-bold tabular-nums">
            {getCurrencyHelpersCached(currency).toUIString(amount * (isNegative ? -1n : 1n), true)}
          </span>
        </RowButton>

        <div
          className={cn(
            'focus-within:ring-focus flex min-h-13 items-center justify-between gap-3 px-4 py-1 text-sm focus-within:ring-2 focus-within:ring-inset',
            flagged.has('merchant') && 'bg-warning/10',
          )}
        >
          <label htmlFor={merchantId} className="text-muted shrink-0">
            {t('add_journey.review.fields.merchant')}
          </label>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {flagged.has('merchant') ? <CheckTag /> : null}
            <input
              id={merchantId}
              value={description}
              placeholder={t('expense_details.add_expense_details.description_placeholder')}
              onChange={(e) => setDescription(e.target.value)}
              className="text-foreground placeholder:text-muted min-h-11 min-w-0 flex-1 bg-transparent text-end font-medium outline-none"
            />
          </span>
        </div>

        <DatePopover
          date={expenseDate}
          onPick={setExpenseDate}
          trigger={
            <RowButton
              label={t('add_journey.review.fields.date')}
              flagged={flagged.has('date')}
              aria-label={`${t('add_journey.review.edit_date')}: ${toUIDate(expenseDate, { year: true })}`}
            >
              {flagged.has('date') ? <CheckTag /> : null}
              {toUIDate(expenseDate, { year: true })}
            </RowButton>
          }
        />

        <CategorySheet
          category={category}
          onPick={setCategory}
          trigger={
            <RowButton
              label={t('add_journey.review.fields.category')}
              flagged={flagged.has('category')}
            >
              {flagged.has('category') ? <CheckTag /> : null}
              {categoryLabel(t, category)}
            </RowButton>
          }
        />
      </div>
    </section>
  );
};

/**
 * Screen 3: "Review expense" after a scan. Edits the shared add store directly.
 */
export const ExpenseDetailsStep: React.FC<{
  lowConfidenceFields?: ScanField[];
  note?: string | null;
  /** Reason codes that will flag the saved expense "Review" (~/lib/expenseReview). */
  reviewReasons?: readonly string[];
  receiptPreviewUrl?: string | null;
  fromPhoto?: boolean;
  onEditAmount: () => void;
  onSplitPress: () => void;
  onCurrencyPick: (currency: CurrencyCode | null) => void;
}> = ({
  lowConfidenceFields = [],
  note,
  reviewReasons = [],
  receiptPreviewUrl,
  fromPhoto = false,
  onEditAmount,
  onSplitPress,
  onCurrencyPick,
}) => {
  const { t, toUIDate, getCurrencyHelpersCached } = useTranslationWithUtils();
  const { t: tReview } = useReviewTranslation();
  const amount = useAddExpenseStore((s) => s.amount);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const currency = useAddExpenseStore((s) => s.currency);
  const description = useAddExpenseStore((s) => s.description);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);
  const fileKey = useAddExpenseStore((s) => s.fileKey);
  const group = useAddExpenseStore((s) => s.group);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const { setExpenseDate } = useAddExpenseStore((s) => s.actions);

  const flagged = fromPhoto
    ? confirmationFlags(lowConfidenceFields, reviewReasons)
    : new Set(lowConfidenceFields);
  const amountFlagged = flagged.has('amount');
  const receiptSrc = receiptPreviewUrl ?? toImageSrc(fileKey);
  // Fields only the confidence scores caught (e.g. tax), which the flagged list can't name.
  const unsureFields = parseReviewReasons(reviewReasons).flatMap((reason) =>
    'field' === reason.kind ? [reason.field] : [],
  );
  const warning =
    note ??
    (0 < flagged.size
      ? t('add_journey.review.warning_pill', {
          fields: [...flagged].map((field) => t(`add_journey.review.fields.${field}`)).join(', '),
        })
      : 0 < unsureFields.length
        ? tReview('warning_fields', {
            fields: unsureFields.map((field) => tReview(`fields.${field}`)).join(', '),
          })
        : null);

  if (fromPhoto) {
    return (
      <div className="flex flex-col gap-4">
        <ScanConfirmationCard
          flagged={flagged}
          receiptSrc={receiptSrc}
          onEditAmount={onEditAmount}
        />

        <GroupedRows>
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

        {note ? (
          <div
            role="status"
            className="border-warning/40 bg-warning/10 text-warning flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>{note}</span>
          </div>
        ) : null}

        <div className="flex justify-end">
          <RepeatLink />
        </div>

        <PaidBySentence onSplitPress={onSplitPress} />
      </div>
    );
  }

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
