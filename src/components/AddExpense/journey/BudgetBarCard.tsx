import { Card, ProgressBar } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CurrencyCode } from '~/lib/currency';

export interface BudgetSnapshot {
  /** Spent so far in the period, excluding this expense (smallest currency unit). */
  spent: bigint;
  /** Budget limit for the period (smallest currency unit). */
  limit: bigint;
  currency: CurrencyCode;
}

/**
 * Kafo AI budget bar shown on the split step. Rendered only when the caller has real budget
 * data; there is no budget backend yet, so callers currently pass nothing and it stays hidden.
 */
export const BudgetBarCard: React.FC<{ budget?: BudgetSnapshot; expenseAmount: bigint }> = ({
  budget,
  expenseAmount,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils();

  if (!budget || 0n >= budget.limit) {
    return null;
  }

  const { toUIString } = getCurrencyHelpersCached(budget.currency);
  const afterThis = budget.spent + expenseAmount;
  const isOver = afterThis > budget.limit;
  const percent = Number((afterThis * 100n) / budget.limit);

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title className="flex items-center gap-1.5 text-sm">
          <Sparkles className="text-accent size-4" aria-hidden />
          {t('add_journey.split.budget_title')}
        </Card.Title>
        <Card.Description>
          {isOver
            ? t('add_journey.split.budget_over', { amount: toUIString(afterThis - budget.limit) })
            : t('add_journey.split.budget_left', { amount: toUIString(budget.limit - afterThis) })}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <ProgressBar
          aria-label={t('add_journey.split.budget_title')}
          value={Math.min(percent, 100)}
          color={isOver ? 'danger' : 'success'}
          size="sm"
        >
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      </Card.Content>
    </Card>
  );
};
