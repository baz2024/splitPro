import { Alert, Card, Input } from '@heroui/react';
import { AlertTriangle, ImageIcon, Pencil, RefreshCcwDot } from 'lucide-react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { useAddExpenseStore } from '~/store/addStore';
import { toImageSrc } from '~/utils/imageUpload';

import { CategoryPicker } from '../CategoryPicker';
import { DateSelector } from '../DateSelector';
import { RecurrenceInput } from '../RecurrenceInput';
import { UploadFile } from '../UploadFile';
import { PaidBySentence } from './PaidBySentence';
import { type ScanField } from './receiptScan';

const FlagHint: React.FC<{ show: boolean }> = ({ show }) => {
  const { t } = useTranslationWithUtils();
  if (!show) {
    return null;
  }
  return (
    <span className="text-warning flex shrink-0 items-center gap-1 text-xs font-medium">
      <AlertTriangle className="size-3.5" aria-hidden />
      {t('add_journey.review.check')}
    </span>
  );
};

const Row: React.FC<{ label: string; flagged?: boolean; children: React.ReactNode }> = ({
  label,
  flagged = false,
  children,
}) => (
  <div
    className={cn(
      'flex min-h-14 items-center justify-between gap-3 px-4 py-2',
      flagged && 'bg-warning/10',
    )}
  >
    <span className="text-muted w-24 shrink-0 text-sm">{label}</span>
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    <FlagHint show={flagged} />
  </div>
);

/**
 * Screen 3 (scan review) and screen 4b (manual details). Edits the shared add store directly.
 */
export const ExpenseDetailsStep: React.FC<{
  lowConfidenceFields?: ScanField[];
  note?: string | null;
  receiptPreviewUrl?: string | null;
  onEditAmount: () => void;
  onSplitPress: () => void;
}> = ({ lowConfidenceFields = [], note, receiptPreviewUrl, onEditAmount, onSplitPress }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();
  const amount = useAddExpenseStore((s) => s.amount);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const currency = useAddExpenseStore((s) => s.currency);
  const description = useAddExpenseStore((s) => s.description);
  const category = useAddExpenseStore((s) => s.category);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);
  const fileKey = useAddExpenseStore((s) => s.fileKey);
  const isFileUploading = useAddExpenseStore((s) => s.isFileUploading);
  const cronExpression = useAddExpenseStore((s) => s.cronExpression);
  const { setDescription, setCategory, setExpenseDate } = useAddExpenseStore((s) => s.actions);

  const flagged = new Set(lowConfidenceFields);
  const hasWarning = 0 < flagged.size || Boolean(note);
  const amountFlagged = flagged.has('amount') || flagged.has('currency');
  const receiptSrc = receiptPreviewUrl ?? toImageSrc(fileKey);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onEditAmount}
        className={cn(
          'bg-surface border-border flex flex-col items-center gap-1 rounded-2xl border px-4 py-5',
          amountFlagged && 'border-warning',
        )}
        aria-label={t('add_journey.review.edit_amount')}
      >
        <span className="text-muted flex items-center gap-1 text-xs">
          {currency}
          <Pencil className="size-3" aria-hidden />
        </span>
        <span dir="ltr" className="text-foreground text-4xl font-semibold tabular-nums">
          {getCurrencyHelpersCached(currency).toUIString(amount * (isNegative ? -1n : 1n), true)}
        </span>
        <FlagHint show={amountFlagged} />
      </button>

      {hasWarning ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('add_journey.review.warning_title')}</Alert.Title>
            <Alert.Description>
              {note ?? t('add_journey.review.warning_fields')}
              {0 < flagged.size ? (
                <span className="mt-1 block text-xs">
                  {[...flagged].map((field) => t(`add_journey.review.fields.${field}`)).join(', ')}
                </span>
              ) : null}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Card className="divide-border divide-y p-0">
        <Row label={t('add_journey.review.fields.merchant')} flagged={flagged.has('merchant')}>
          <Input
            aria-label={t('add_journey.review.fields.merchant')}
            placeholder={t('expense_details.add_expense_details.description_placeholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-11 w-full text-end"
            variant="secondary"
          />
        </Row>
        <Row label={t('add_journey.review.fields.category')} flagged={flagged.has('category')}>
          <CategoryPicker category={category} onCategoryPick={setCategory} />
        </Row>
        <Row label={t('add_journey.review.fields.date')} flagged={flagged.has('date')}>
          <DateSelector mode="single" required selected={expenseDate} onSelect={setExpenseDate} />
        </Row>
        <Row label={t('add_journey.review.receipt')}>
          {receiptSrc ? (
            // oxlint-disable-next-line next/no-img-element -- local blob/preview URLs
            <img
              src={receiptSrc}
              alt={t('expense_details.receipt.thumbnail_alt')}
              className={cn('size-10 rounded-md object-cover', isFileUploading && 'opacity-50')}
            />
          ) : (
            <ImageIcon className="text-muted size-5" aria-hidden />
          )}
          <UploadFile />
        </Row>
        <Row label={t('add_journey.review.repeat')}>
          <RecurrenceInput>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 text-sm"
              aria-label={t('recurrence.toggle_options')}
            >
              <RefreshCcwDot
                className={cn('size-5', cronExpression ? 'text-accent' : 'text-muted')}
              />
              <span className={cronExpression ? 'text-foreground' : 'text-muted'}>
                {cronExpression
                  ? t('add_journey.review.repeat_on')
                  : t('add_journey.review.repeat_off')}
              </span>
            </button>
          </RecurrenceInput>
        </Row>
      </Card>

      <PaidBySentence onSplitPress={onSplitPress} />
    </div>
  );
};
