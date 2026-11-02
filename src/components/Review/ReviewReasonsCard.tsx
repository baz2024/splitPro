import { Button } from '@heroui/react';
import { AlertTriangle, Check } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import { type ReviewReason, parseReviewReasons } from '~/lib/expenseReview';
import { api } from '~/utils/api';

import { ReviewChip } from './ReviewChip';
import { useReviewTranslation } from './useReviewTranslation';

type ReviewT = ReturnType<typeof useReviewTranslation>['t'];

export const reviewReasonLabel = (t: ReviewT, reason: ReviewReason): string => {
  if ('skipped' === reason.kind) {
    return t('reasons.skipped');
  }
  if ('field' === reason.kind) {
    return t(`reasons.field.${reason.field}`);
  }
  // The AI's own short note (e.g. "Tax looked blurry") is shown as written.
  return reason.text;
};

/**
 * Expense detail: why the expense is flagged "Review", plus a "Looks right" action that clears
 * the flag. Rendered only when the expense needs review and the viewer may clear it.
 */
export const ReviewReasonsCard: React.FC<{
  expenseId: string;
  reviewReasons: readonly string[];
  canMarkReviewed: boolean;
}> = ({ expenseId, reviewReasons, canMarkReviewed }) => {
  const { t } = useReviewTranslation();
  const utils = api.useUtils();
  const markReviewed = api.expense.markReviewed.useMutation();

  const reasons = parseReviewReasons(reviewReasons);

  const onLooksRight = async () => {
    try {
      await markReviewed.mutateAsync({ expenseId });
      toast.success(t('card.marked'));
      await Promise.all([
        utils.expense.getExpenseDetails.invalidate({ expenseId }),
        utils.expense.getGroupExpenses.invalidate(),
        utils.expense.getExpensesWithFriend.invalidate(),
        utils.project.summary.invalidate(),
      ]);
    } catch (error) {
      console.error(error);
      toast.error(t('card.failed'));
    }
  };

  return (
    <section
      aria-labelledby={`review-${expenseId}`}
      className="border-warning/40 bg-warning/10 mb-4 flex flex-col gap-3 rounded-xl border px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="text-warning size-4 shrink-0" aria-hidden />
        <h2 id={`review-${expenseId}`} className="text-foreground flex-1 text-sm font-semibold">
          {t('card.title')}
        </h2>
        <ReviewChip />
      </div>
      <p className="text-muted text-xs">{t('card.intro')}</p>
      {0 === reasons.length ? (
        <p className="text-warning text-sm">{t('card.no_reasons')}</p>
      ) : (
        <ul className="text-warning flex list-disc flex-col gap-1 ps-5 text-sm">
          {reasons.map((reason) => (
            <li key={'note' === reason.kind ? `note:${reason.text}` : JSON.stringify(reason)}>
              {reviewReasonLabel(t, reason)}
            </li>
          ))}
        </ul>
      )}
      {canMarkReviewed ? (
        <Button
          size="sm"
          className="self-start rounded-full"
          isPending={markReviewed.isPending}
          onPress={() => {
            onLooksRight().catch(console.error);
          }}
        >
          <Check className="size-4" aria-hidden />
          {t('card.looks_right')}
        </Button>
      ) : null}
    </section>
  );
};
