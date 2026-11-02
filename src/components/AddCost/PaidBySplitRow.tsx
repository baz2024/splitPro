import { ChevronRight } from 'lucide-react';
import React from 'react';

import { SplitStep, useNeedsParticipants } from '~/components/AddExpense/journey/SplitStep';
import { AppDrawer } from '~/components/ui/drawer';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { useAddExpenseStore } from '~/store/addStore';

/** True when only the current user is on the cost and no group/project is picked. */
export const useIsPersonalCost = () =>
  useAddExpenseStore((s) => !s.group && 1 >= s.participants.length);

/**
 * "Paid by · split" row. Shows the current payer and split; tapping opens the existing split
 * step (people, payer, Equal/Shares/%/Exact) in a drawer. With nobody added it is personal.
 */
export const PaidBySplitRow: React.FC<{ enableSendingInvites: boolean }> = ({
  enableSendingInvites,
}) => {
  const { t, displayName, generateSplitDescription } = useTranslationWithUtils([
    'addcost',
    'common',
  ]);
  const paidBy = useAddExpenseStore((s) => s.paidBy);
  const currentUser = useAddExpenseStore((s) => s.currentUser);
  const splitType = useAddExpenseStore((s) => s.splitType);
  const participants = useAddExpenseStore((s) => s.participants);
  const splitShares = useAddExpenseStore((s) => s.splitShares);
  const group = useAddExpenseStore((s) => s.group);
  const canSplitScreenClosed = useAddExpenseStore((s) => s.canSplitScreenClosed);
  const isPersonal = useIsPersonalCost();
  const needsParticipants = useNeedsParticipants();

  const payerName =
    paidBy?.id === currentUser?.id
      ? t('ui.expense.payer.current_user', { ns: 'common' })
      : displayName(paidBy);

  const summary = isPersonal
    ? t('split.personal')
    : t('split.summary', {
        payer: payerName,
        split: generateSplitDescription(
          splitType,
          participants,
          splitShares,
          paidBy,
          currentUser,
          false,
        ),
      });

  return (
    <AppDrawer
      title={t('split.title')}
      actionTitle={t('split.done')}
      shouldCloseOnAction
      actionDisabled={!canSplitScreenClosed}
      className="h-[85vh]"
      trigger={
        <button
          type="button"
          className="hover:bg-surface-secondary focus-visible:ring-focus flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span className="shrink-0 text-sm">{t('fields.paid_by_split')}</span>
          {/* The drawer trigger injects `justify-center`; ms-auto keeps the value at the end. */}
          <span className="text-muted ms-auto flex min-w-0 items-center gap-1 text-sm">
            <span className="truncate">{group ? `${group.name} · ${summary}` : summary}</span>
            <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          </span>
        </button>
      }
    >
      <div className="flex flex-col gap-3 pb-6">
        {needsParticipants ? (
          <p className="text-muted text-sm">{t('split.personal_hint')}</p>
        ) : null}
        <SplitStep enableSendingInvites={enableSendingInvites} />
      </div>
    </AppDrawer>
  );
};
