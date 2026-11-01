import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { SUBSCRIPTIONS_NAMESPACES, type SubscriptionsOverview } from './types';
import { UnusedSheet } from './UnusedSheet';

interface RunRateCardProps {
  overview: SubscriptionsOverview;
}

/**
 * Monthly run-rate (primary currency, others noted) beside the active subscription count and,
 * when any exist, a link to the subscriptions unused for 30+ days.
 */
export const RunRateCard: React.FC<RunRateCardProps> = ({ overview }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(SUBSCRIPTIONS_NAMESPACES);
  const [primary, ...others] = overview.runRates;

  const format = (amount: bigint, currency: string) =>
    getCurrencyHelpersCached(currency).toUIString(amount);

  const otherAmounts = others.map(({ monthly, currency }) => format(monthly, currency)).join(' · ');

  return (
    <section className="border-border bg-surface flex justify-between gap-4 rounded-[20px] border p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-muted text-xs">{t('run_rate.label')}</span>
        {primary ? (
          <span dir="ltr" className="text-foreground text-[26px] font-bold tracking-tight">
            {format(primary.monthly, primary.currency)}
          </span>
        ) : (
          <span className="text-foreground py-2 text-sm font-medium">{t('run_rate.empty')}</span>
        )}
        {overview.budget ? (
          <span className="text-muted text-xs">
            {t('run_rate.budget_share', { percent: overview.budget.percent })}
          </span>
        ) : null}
        {otherAmounts ? (
          <span className="text-muted text-xs">
            {t('run_rate.other_currencies', { amounts: otherAmounts })}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-muted text-xs">{t('active.label')}</span>
        <span dir="ltr" className="text-foreground text-[26px] font-bold">
          {overview.items.length}
        </span>
        <UnusedSheet overview={overview} />
      </div>
    </section>
  );
};
