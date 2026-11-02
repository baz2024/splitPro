import React from 'react';

import { Money } from '~/components/Safi/Money';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { daysUntil } from '~/server/subscriptions/helpers';

import { monthCash } from './subscriptionMaths';
import { SUBSCRIPTIONS_NAMESPACES, type SubscriptionsOverview } from './types';

/**
 * Two tiles: Paid this month / Still to pay (next charge in N days), in the main currency.
 * Both come from the same schedule, so together they make this month's total; a note under
 * them explains when that total differs from the run-rate (a monthly average).
 */
export const MonthCashTiles: React.FC<{ overview: SubscriptionsOverview; now: Date }> = ({
  overview,
  now,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(SUBSCRIPTIONS_NAMESPACES);
  const primary = overview.runRates[0];
  if (!primary) {
    return null;
  }
  const { currency } = primary;
  const cash = monthCash(overview.items, currency, now);
  const { toUIString } = getCurrencyHelpersCached(currency);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <section className="border-border bg-surface flex min-w-0 flex-col gap-0.5 rounded-[20px] border p-4">
          <h2 className="text-muted text-xs">{t('month.paid')}</h2>
          <Money
            amount={cash.paid}
            currency={currency}
            className="text-foreground self-start text-xl font-bold"
          />
        </section>
        <section className="border-border bg-surface flex min-w-0 flex-col gap-0.5 rounded-[20px] border p-4">
          <h2 className="text-muted text-xs">{t('month.remaining')}</h2>
          <Money
            amount={cash.remaining}
            currency={currency}
            className="text-foreground self-start text-xl font-bold"
          />
          <span className="text-muted text-xs">
            {cash.nextCharge
              ? t('month.next', { days: Math.max(daysUntil(cash.nextCharge, now), 0) })
              : t('month.nothing_left')}
          </span>
        </section>
      </div>
      {cash.total !== primary.monthly && (
        <p className="text-muted px-1 text-xs">
          {t('audit_g.month_total', { total: toUIString(cash.total) })}
        </p>
      )}
    </div>
  );
};
