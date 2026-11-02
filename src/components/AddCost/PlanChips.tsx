import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { PLAN_PRICE_CURRENCY, type ServicePlan } from '~/lib/serviceCatalog';
import { cn } from '~/lib/utils';
import { CHIP_SELECTED } from '~/components/ui/chipStyles';

/**
 * Known plans for the picked service as price chips ("Claude Pro · $20"). Tapping one fills the
 * plan and price. Prices are public list prices, so the note asks people to check their plan.
 */
export const PlanChips: React.FC<{
  plans: readonly ServicePlan[];
  selectedPlan: string;
  onPick: (plan: ServicePlan) => void;
}> = ({ plans, selectedPlan, onPick }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['common']);
  const { toUIString } = getCurrencyHelpersCached(PLAN_PRICE_CURRENCY);

  if (0 === plans.length) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="addcost-plans-heading">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2
          id="addcost-plans-heading"
          className="text-muted text-xs font-semibold tracking-widest uppercase"
        >
          {t('audit_b.addcost.plans')}
        </h2>
        <span className="text-muted text-[11px]">{t('audit_b.addcost.list_price_note')}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {plans.map((plan) => {
          const isSelected = plan.name === selectedPlan.trim();
          return (
            <button
              key={plan.name}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onPick(plan)}
              className={cn(
                'focus-visible:ring-focus inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium outline-none focus-visible:ring-2',
                isSelected
                  ? CHIP_SELECTED
                  : 'border-border bg-surface text-foreground hover:bg-surface-secondary',
              )}
            >
              <span>{plan.name}</span>
              <span dir="ltr" className={cn('tabular-nums', !isSelected && 'text-muted')}>
                {toUIString(plan.monthlyUsd)}
                {plan.perSeat ? ` ${t('audit_b.addcost.per_seat')}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
