import React from 'react';

import { RankedBars } from '~/components/Charts/RankedBars';
import { formatShare, minorToMajor } from '~/components/Charts/scale';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { monthlyCostByService } from '~/server/insights/shape';

import { type SubscriptionsOverview } from './types';

const NS = ['insights', 'subscriptions', 'common'];

/**
 * Monthly cost by service, in the run-rate's main currency: the top services as ranked bars and
 * the rest folded into one bar. Subscriptions in other currencies are left to the run-rate note.
 * Hidden when there is fewer than two services to compare.
 */
export const ServiceCostCard: React.FC<{ overview: SubscriptionsOverview }> = ({ overview }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const primary = overview.runRates[0];
  if (!primary) {
    return null;
  }

  const services = monthlyCostByService(overview.items, primary.currency);
  if (2 > services.length) {
    return null;
  }

  const { toUIString } = getCurrencyHelpersCached(primary.currency);
  const data = services.map((service) => ({
    key: service.isOther ? '__other__' : service.key,
    label: service.isOther ? t('services.other', { count: service.count }) : service.label,
    hint:
      !service.isOther && 1 < service.count
        ? t('services.plans', { count: service.count })
        : undefined,
    value: minorToMajor(service.total, primary.currency),
    display: toUIString(service.total),
    share: formatShare(service.percent, i18n.language),
    isOther: service.isOther,
  }));

  return (
    <section
      className="border-border bg-surface flex flex-col gap-3 rounded-[20px] border p-4"
      aria-labelledby="service-cost-title"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="service-cost-title" className="text-foreground text-base font-semibold">
          {t('services.title')}
        </h2>
        <p className="text-muted text-xs">
          {t('services.subtitle', { currency: primary.currency })}
        </p>
      </div>
      <RankedBars data={data} ariaLabel={t('services.title')} />
    </section>
  );
};
