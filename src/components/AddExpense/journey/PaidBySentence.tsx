import { SplitType } from '@prisma/client';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { useAddExpenseStore } from '~/store/addStore';

import { PayerSelectionForm } from '../SplitTypeSection';

/**
 * Outlined sentence pill: "Paid by **Basel** · split **equally (2)**". The payer opens the
 * existing payer picker; the split part calls onSplitPress (jump to the split step) when given.
 */
export const PaidBySentence: React.FC<{ onSplitPress?: () => void }> = ({ onSplitPress }) => {
  const { t, displayName } = useTranslationWithUtils();
  const paidBy = useAddExpenseStore((s) => s.paidBy);
  const currentUser = useAddExpenseStore((s) => s.currentUser);
  const splitType = useAddExpenseStore((s) => s.splitType);
  const participants = useAddExpenseStore((s) => s.participants);
  const splitShares = useAddExpenseStore((s) => s.splitShares);

  const includedCount = participants.filter(
    (p) => 0n !== (splitShares[p.id]?.[SplitType.EQUAL] ?? 1n),
  ).length;
  const splitText =
    SplitType.EQUAL === splitType
      ? t('add_journey.sentence.equally', { count: includedCount })
      : t('add_journey.sentence.unequally');

  const linkClass =
    'text-accent focus-visible:ring-focus min-h-11 rounded-lg px-1 font-semibold outline-none focus-visible:ring-2';

  return (
    <div className="border-border text-muted flex min-h-12 flex-wrap items-center justify-center gap-x-1 rounded-full border px-4 text-sm">
      <span>{t('add_journey.sentence.paid_by')}</span>
      <PayerSelectionForm>
        <button type="button" className={`${linkClass} max-w-40 truncate`}>
          {displayName(paidBy, currentUser?.id)}
        </button>
      </PayerSelectionForm>
      <span aria-hidden>·</span>
      <span>{t('add_journey.sentence.split')}</span>
      {onSplitPress ? (
        <button type="button" className={linkClass} onClick={onSplitPress}>
          {splitText}
        </button>
      ) : (
        <span className="text-foreground font-semibold">{splitText}</span>
      )}
    </div>
  );
};
