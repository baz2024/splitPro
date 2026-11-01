import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { SplitType } from '@prisma/client';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';

import { useAddExpenseStore } from '~/store/addStore';

import { SelectUserOrGroup } from '../SelectUserOrGroup';
import { SplitSection, getSplitProps } from '../SplitTypeSection';
import { UserInput } from '../UserInput';
import { BudgetBarCard, type BudgetSnapshot } from './BudgetBarCard';
import { PaidBySentence } from './PaidBySentence';

const SEGMENTS = [
  { splitType: SplitType.EQUAL, labelKey: 'add_journey.split.equal' },
  { splitType: SplitType.SHARE, labelKey: 'add_journey.split.shares' },
  { splitType: SplitType.PERCENTAGE, labelKey: 'add_journey.split.percent' },
  { splitType: SplitType.EXACT, labelKey: 'add_journey.split.exact' },
] as const;

const isSegmentSplitType = (value: unknown): value is (typeof SEGMENTS)[number]['splitType'] =>
  SEGMENTS.some(({ splitType }) => splitType === value);

export const useNeedsParticipants = () =>
  useAddExpenseStore((s) => s.showFriends || (1 === s.participants.length && !s.group));

/** Screen 5: who is in, how it is split, and (when known) the Kafo AI budget impact. */
export const SplitStep: React.FC<{
  enableSendingInvites: boolean;
  budget?: BudgetSnapshot;
}> = ({ enableSendingInvites, budget }) => {
  const { t } = useTranslation();
  const splitType = useAddExpenseStore((s) => s.splitType);
  const amount = useAddExpenseStore((s) => s.amount);
  const { setSplitType } = useAddExpenseStore((s) => s.actions);
  const needsParticipants = useNeedsParticipants();

  const splitProps = useMemo(() => getSplitProps(t), [t]);
  const activeProps = splitProps.find((props) => props.splitType === splitType);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
          {t('add_journey.split.who')}
        </h2>
        <UserInput />
        {needsParticipants ? (
          <SelectUserOrGroup enableSendingInvites={enableSendingInvites} />
        ) : null}
      </section>

      {needsParticipants ? null : (
        <>
          <PaidBySentence />
          <ToggleButtonGroup
            aria-label={t('add_journey.split.method')}
            selectionMode="single"
            disallowEmptySelection
            fullWidth
            selectedKeys={isSegmentSplitType(splitType) ? [splitType] : []}
            onSelectionChange={(keys) => {
              const [next] = [...keys];
              if (isSegmentSplitType(next)) {
                setSplitType(next);
              }
            }}
          >
            {SEGMENTS.map(({ splitType: segment, labelKey }) => (
              <ToggleButton key={segment} id={segment} className="min-h-11">
                {t(labelKey)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {activeProps ? <SplitSection key={activeProps.splitType} {...activeProps} /> : null}

          <BudgetBarCard budget={budget} expenseAmount={amount} />
        </>
      )}
    </div>
  );
};
