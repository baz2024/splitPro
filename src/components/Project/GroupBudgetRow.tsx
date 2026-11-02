import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { BudgetSheet } from './BudgetSheet';

interface GroupBudgetRowProps {
  groupId: number;
  budget: bigint | null;
  budgetCurrency: string | null;
  defaultCurrency: string | null;
  disabled?: boolean;
}

/** "Monthly budget" row for group settings; opens the shared budget sheet. */
export const GroupBudgetRow: React.FC<GroupBudgetRowProps> = ({
  groupId,
  budget,
  budgetCurrency,
  defaultCurrency,
  disabled,
}) => {
  const { t } = useTranslation('projects');
  const { getCurrencyHelpersCached } = useTranslationWithUtils();
  const value =
    null !== budget && budgetCurrency
      ? getCurrencyHelpersCached(budgetCurrency).toUIString(budget)
      : null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{t('budget_sheet.row_label')}</p>
        <Link
          href={`/projects/${groupId}`}
          className="text-accent focus-visible:ring-focus inline-flex min-h-11 items-center gap-0.5 rounded-md px-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {t('title')}
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
      <BudgetSheet
        groupId={groupId}
        budget={budget}
        budgetCurrency={budgetCurrency}
        fallbackCurrency={defaultCurrency}
        trigger={
          <button
            type="button"
            disabled={disabled}
            className="bg-surface border-border focus-visible:ring-focus mt-2 flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-2 text-start text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            <span className={null === value ? 'text-muted' : 'font-medium'} dir="ltr">
              {value ?? t('budget_sheet.not_set')}
            </span>
            <ChevronRight className="text-muted size-4 rtl:rotate-180" aria-hidden />
          </button>
        }
      />
    </div>
  );
};
