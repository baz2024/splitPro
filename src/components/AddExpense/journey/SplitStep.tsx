import { SplitType } from '@prisma/client';
import { ChevronDown, Receipt } from 'lucide-react';
import React, { useMemo } from 'react';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { findService } from '~/lib/serviceCatalog';
import { cn } from '~/lib/utils';
import { type Participant, useAddExpenseStore } from '~/store/addStore';

import { EntityAvatar } from '../../ui/avatar';
import { SelectUserOrGroup } from '../SelectUserOrGroup';
import { PayerSelectionForm, SplitSection, getSplitProps } from '../SplitTypeSection';
import { UserInput } from '../UserInput';
import { BudgetBarCard } from './BudgetBarCard';
import { categoryLabel } from './journeyPickers';
import { GroupedRows, RowButton, Segmented } from './journeyUi';

const SEGMENTS = [
  { id: SplitType.EQUAL, labelKey: 'add_journey.split.equal' },
  { id: SplitType.SHARE, labelKey: 'add_journey.split.shares' },
  { id: SplitType.PERCENTAGE, labelKey: 'add_journey.split.percent' },
  { id: SplitType.EXACT, labelKey: 'add_journey.split.exact' },
] as const;

type SegmentSplitType = (typeof SEGMENTS)[number]['id'];

const isSegmentSplitType = (value: unknown): value is SegmentSplitType =>
  SEGMENTS.some(({ id }) => id === value);

export const useNeedsParticipants = () =>
  useAddExpenseStore((s) => s.showFriends || (1 === s.participants.length && !s.group));

/** What each participant owes for this expense (positive, smallest unit). */
const owedShare = (participant: Participant, payerId: number | undefined, amount: bigint) =>
  (participant.id === payerId ? amount : 0n) - (participant.amount ?? 0n);

/** Header card on the split screen: badge, name, "1 Nov · Hosting · receipt ✓", amount. */
export const SplitSummaryCard: React.FC = () => {
  const { t, toUIDate, getCurrencyHelpersCached } = useTranslationWithUtils([
    'common',
    'categories',
  ]);
  const description = useAddExpenseStore((s) => s.description);
  const category = useAddExpenseStore((s) => s.category);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);
  const fileKey = useAddExpenseStore((s) => s.fileKey);
  const amount = useAddExpenseStore((s) => s.amount);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const currency = useAddExpenseStore((s) => s.currency);

  const name = description.trim() || t('add_journey.review.untitled');
  const meta = [
    toUIDate(expenseDate, { useToday: true }),
    categoryLabel(t, category),
    fileKey ? t('add_journey.split.receipt_attached') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="bg-surface border-border flex items-center gap-3 rounded-2xl border p-4">
      {findService(description) ? (
        <ServiceBadge service={description} size="lg" />
      ) : (
        <span
          aria-hidden
          className="bg-surface-tertiary text-accent flex size-12 shrink-0 items-center justify-center rounded-2xl"
        >
          <Receipt className="size-5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{name}</span>
        <span className="text-muted truncate text-xs">{meta}</span>
      </div>
      <span dir="ltr" className="shrink-0 text-base font-semibold tabular-nums">
        {getCurrencyHelpersCached(currency).toUIString(amount * (isNegative ? -1n : 1n), true)}
      </span>
    </div>
  );
};

/** "Paid by … Basel" row; opens the existing payer picker. */
const PaidByRow: React.FC = () => {
  const { t, displayName } = useTranslationWithUtils();
  const paidBy = useAddExpenseStore((s) => s.paidBy);
  const currentUser = useAddExpenseStore((s) => s.currentUser);

  return (
    <PayerSelectionForm>
      <RowButton label={t('add_journey.sentence.paid_by')}>
        <span className="truncate">{displayName(paidBy, currentUser?.id)}</span>
        <ChevronDown className="text-muted size-4 shrink-0" aria-hidden />
      </RowButton>
    </PayerSelectionForm>
  );
};

/** Equal split: one row per person; tapping a row includes or excludes them. */
const EqualPeopleRows: React.FC = () => {
  const { t, displayName, getCurrencyHelpersCached } = useTranslationWithUtils();
  const participants = useAddExpenseStore((s) => s.participants);
  const splitShares = useAddExpenseStore((s) => s.splitShares);
  const paidBy = useAddExpenseStore((s) => s.paidBy);
  const currentUser = useAddExpenseStore((s) => s.currentUser);
  const amount = useAddExpenseStore((s) => s.amount);
  const currency = useAddExpenseStore((s) => s.currency);
  const { setSplitShare } = useAddExpenseStore((s) => s.actions);
  const { toUIString } = getCurrencyHelpersCached(currency);
  const payerName = displayName(paidBy, currentUser?.id);

  return (
    <GroupedRows>
      {participants.map((participant) => {
        const included = 0n !== splitShares[participant.id]?.[SplitType.EQUAL];
        const isPayer = participant.id === paidBy?.id;
        const share = owedShare(participant, paidBy?.id, amount);
        const subtitle = isPayer
          ? t('add_journey.split.paid', { amount: `\u2066${toUIString(amount)}\u2069` })
          : included
            ? t('add_journey.split.owes', { name: payerName })
            : t('add_journey.split.not_included');

        return (
          <button
            key={participant.id}
            type="button"
            role="checkbox"
            aria-checked={included}
            onClick={() => setSplitShare(SplitType.EQUAL, participant.id, included ? 0n : 1n)}
            className="hover:bg-surface-secondary focus-visible:ring-focus flex min-h-16 w-full items-center gap-3 px-4 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            <span
              className={cn('flex min-w-0 flex-1 items-center gap-3', !included && 'opacity-50')}
            >
              <EntityAvatar entity={participant} size={36} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {displayName(participant, currentUser?.id)}
                </span>
                <span className="text-muted truncate text-xs">{subtitle}</span>
              </span>
            </span>
            <span dir="ltr" className="shrink-0 text-sm font-semibold tabular-nums">
              {toUIString(included ? share : 0n)}
            </span>
          </button>
        );
      })}
      <PaidByRow />
    </GroupedRows>
  );
};

/** Screen 5: who is in, how it is split, and (for projects with a budget) the budget hit. */
export const SplitStep: React.FC<{ enableSendingInvites: boolean }> = ({
  enableSendingInvites,
}) => {
  const { t, displayName } = useTranslationWithUtils();
  const splitType = useAddExpenseStore((s) => s.splitType);
  const participants = useAddExpenseStore((s) => s.participants);
  const currentUser = useAddExpenseStore((s) => s.currentUser);
  const { setSplitType } = useAddExpenseStore((s) => s.actions);
  const needsParticipants = useNeedsParticipants();

  const splitProps = useMemo(() => getSplitProps(t), [t]);
  const activeProps = splitProps.find((props) => props.splitType === splitType);
  const others = participants.filter((p) => p.id !== currentUser?.id);
  const [firstOther] = others;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label={t('add_journey.split.people')}>
        <UserInput />
        {needsParticipants ? (
          <SelectUserOrGroup enableSendingInvites={enableSendingInvites} />
        ) : null}
      </section>

      {needsParticipants ? null : (
        <>
          <Segmented
            ariaLabel={t('add_journey.split.method')}
            items={SEGMENTS.map(({ id, labelKey }) => ({ id, label: t(labelKey) }))}
            selected={isSegmentSplitType(splitType) ? splitType : null}
            onChange={setSplitType}
          />

          {SplitType.EQUAL === splitType ? (
            <EqualPeopleRows />
          ) : activeProps ? (
            <GroupedRows>
              <div className="pb-4">
                <SplitSection key={activeProps.splitType} {...activeProps} />
              </div>
              <PaidByRow />
            </GroupedRows>
          ) : null}

          <BudgetBarCard />

          {firstOther ? (
            <p className="text-muted text-xs">
              {t('add_journey.split.notify', {
                count: others.length,
                name: displayName(firstOther, currentUser?.id),
              })}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};
