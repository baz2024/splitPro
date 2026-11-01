import { Button } from '@heroui/react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { useAddExpenseStore } from '~/store/addStore';

import { PayerSelectionForm } from '../SplitTypeSection';

/**
 * "Paid by you · split equally". The payer opens the existing payer drawer; the split part
 * calls onSplitPress (to jump to the split step) when given.
 */
export const PaidBySentence: React.FC<{ onSplitPress?: () => void }> = ({ onSplitPress }) => {
  const { t, displayName, generateSplitDescription } = useTranslationWithUtils();
  const paidBy = useAddExpenseStore((s) => s.paidBy);
  const currentUser = useAddExpenseStore((s) => s.currentUser);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const splitType = useAddExpenseStore((s) => s.splitType);
  const participants = useAddExpenseStore((s) => s.participants);
  const splitShares = useAddExpenseStore((s) => s.splitShares);

  const payerName =
    paidBy?.id === currentUser?.id
      ? t(`ui.expense.${isNegative ? 'recipient' : 'payer'}.current_user`)
      : displayName(paidBy);
  const splitText = generateSplitDescription(
    splitType,
    participants,
    splitShares,
    paidBy,
    currentUser,
    isNegative,
  );

  return (
    <div className="text-muted flex flex-wrap items-center justify-center gap-x-1 text-sm">
      <span>{t(`ui.expense.${isNegative ? 'received_by' : 'paid_by'}`)}</span>
      <PayerSelectionForm>
        <button
          type="button"
          className="text-accent min-h-11 max-w-40 truncate px-1 font-medium underline-offset-4 hover:underline"
        >
          {payerName}
        </button>
      </PayerSelectionForm>
      <span aria-hidden>·</span>
      {onSplitPress ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-accent min-h-11 px-1"
          onPress={onSplitPress}
        >
          {splitText}
        </Button>
      ) : (
        <span className="text-foreground">{splitText}</span>
      )}
    </div>
  );
};
