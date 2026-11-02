import { ChevronRight, PiggyBank } from 'lucide-react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { unusedSavings } from './subscriptionMaths';
import { SUBSCRIPTIONS_NAMESPACES, type SubscriptionsOverview } from './types';
import { UnusedSheet } from './UnusedSheet';

/**
 * "Cancel 2 unused services, save $480 a year": a reason to act on the unused 30+ days list.
 * Tapping it opens the unused sheet. Hidden when nothing in the main currency is unused.
 */
export const SavingsBanner: React.FC<{ overview: SubscriptionsOverview }> = ({ overview }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(SUBSCRIPTIONS_NAMESPACES);
  const currency = overview.runRates[0]?.currency;
  if (!currency) {
    return null;
  }
  const savings = unusedSavings(overview.items, currency);
  if (0 === savings.count || 0n >= savings.yearly) {
    return null;
  }

  return (
    <UnusedSheet
      overview={overview}
      trigger={
        <button
          type="button"
          aria-label={t('savings.open')}
          className="bg-success/10 border-success/30 focus-visible:ring-focus flex min-h-14 w-full items-center gap-3 rounded-[20px] border px-4 py-3 text-start focus-visible:ring-2 focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="bg-success/15 text-success inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
          >
            <PiggyBank className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-foreground text-sm font-semibold">
              {t('savings.banner', {
                count: savings.count,
                amount: getCurrencyHelpersCached(currency).toUIString(savings.yearly),
              })}
            </span>
            <span className="text-muted text-xs">{t('savings.hint')}</span>
          </span>
          <ChevronRight className="text-muted size-4 shrink-0 rtl:rotate-180" aria-hidden />
        </button>
      }
    />
  );
};
