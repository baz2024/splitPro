import React from 'react';

import { isolateLtr, monthName, useTzOffset } from '~/components/Project/format';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { useAddExpenseStore } from '~/store/addStore';
import { api } from '~/utils/api';

const percentOf = (part: bigint, whole: bigint) =>
  0n >= whole ? 0 : Math.min(100, Math.max(0, Number((part * 10000n) / whole) / 100));

const isThisMonth = (date: Date, now = new Date()) =>
  date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();

/**
 * "<Project> · <Month> budget" card on the split step (Figma screen 5). Reads the project's
 * real budget from `project.summary`; renders nothing when the expense is not in a project,
 * the project has no budget, the expense is in another currency, or it is dated outside the
 * current budget month — the hit would not be accurate in those cases.
 */
export const BudgetBarCard: React.FC = () => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils();
  const group = useAddExpenseStore((s) => s.group);
  const amount = useAddExpenseStore((s) => s.amount);
  const isNegative = useAddExpenseStore((s) => s.isNegative);
  const currency = useAddExpenseStore((s) => s.currency);
  const expenseDate = useAddExpenseStore((s) => s.expenseDate);

  const tzOffset = useTzOffset();
  const summaryQuery = api.project.summary.useQuery(
    { groupId: group?.id ?? 0, tzOffset },
    { enabled: Boolean(group?.id), staleTime: 60_000 },
  );
  const summary = summaryQuery.data;

  if (
    !group ||
    !summary ||
    null === summary.budget ||
    0n >= summary.budget ||
    summary.currency !== currency ||
    isNegative ||
    !isThisMonth(expenseDate)
  ) {
    return null;
  }

  const { toUIString } = getCurrencyHelpersCached(summary.currency);
  const { budget, spent } = summary;
  const afterThis = spent + amount;
  const left = budget - afterThis;
  const isOver = 0n > left;
  const month = monthName(i18n.language, summary.year, summary.month);
  const spentPercent = percentOf(spent, budget);
  const thisPercent = Math.max(0, percentOf(afterThis, budget) - spentPercent);
  const title = t('add_journey.split.budget_title', { project: summary.name, month });

  return (
    <section className="bg-surface border-border flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-muted min-w-0 truncate text-sm">{title}</h2>
        <p dir="ltr" className="shrink-0 text-sm font-semibold tabular-nums">
          {toUIString(afterThis)} / {toUIString(budget)}
        </p>
      </div>
      <div
        role="meter"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentOf(afterThis, budget))}
        className="bg-surface-tertiary flex h-2 w-full overflow-hidden rounded-full"
      >
        <span
          className={cn('h-full', isOver ? 'bg-danger' : 'bg-accent')}
          style={{ width: `${spentPercent}%` }}
        />
        <span className="bg-warning h-full" style={{ width: `${Math.max(thisPercent, 0.8)}%` }} />
      </div>
      <p className={cn('text-xs', isOver ? 'text-danger' : 'text-success')}>
        {isOver
          ? t('add_journey.split.budget_adds_over', {
              amount: isolateLtr(toUIString(amount)),
              over: isolateLtr(toUIString(-left)),
            })
          : t('add_journey.split.budget_adds', {
              amount: isolateLtr(toUIString(amount)),
              left: isolateLtr(toUIString(left)),
              days: summary.daysLeft,
            })}
      </p>
    </section>
  );
};
