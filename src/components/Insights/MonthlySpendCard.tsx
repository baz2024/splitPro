import { TrendingDown, TrendingUp } from 'lucide-react';
import React from 'react';

import { monthLabels } from '~/components/Charts/monthLabels';
import { minorToMajor } from '~/components/Charts/scale';
import { SparkBars } from '~/components/Charts/SparkBars';
import { isolateLtr, useTzOffset } from '~/components/Project/format';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { api } from '~/utils/api';

const NS = ['insights', 'common'];
const MONTHS = 7;

/**
 * Stat tile for the home screen: the signed-in user's own share of spending this month across
 * all groups, how it compares with the average of the previous six months, and a 7-column trend.
 * Renders nothing until there is spending to show.
 */
export const MonthlySpendCard: React.FC<{ className?: string }> = ({ className }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const tzOffset = useTzOffset();
  const trendQuery = api.insights.mySpendTrend.useQuery({ tzOffset, months: MONTHS });
  const trend = trendQuery.data;

  if (!trend?.hasData) {
    return null;
  }

  const { toUIString } = getCurrencyHelpersCached(trend.currency);
  const { comparison } = trend;
  const lastIndex = trend.months.length - 1;
  const earlierMonths = MONTHS - 1;

  const spark = trend.months.map((month, index) => ({
    key: month.key,
    value: minorToMajor(0n < month.total ? month.total : 0n, trend.currency),
    description: `${monthLabels(i18n.language, month.year, month.month).long}: ${toUIString(month.total)}`,
    highlight: lastIndex === index,
  }));

  const change = comparison.changePercent;
  const others = trend.otherCurrencies
    .map(({ currency, total }) => isolateLtr(getCurrencyHelpersCached(currency).toUIString(total)))
    .join(' · ');

  const renderDelta = () => {
    if (null === change || null === comparison.average) {
      return <span className="text-muted">{t('my_spend.no_history')}</span>;
    }
    const average = isolateLtr(toUIString(comparison.average));
    if (0 === change) {
      return (
        <span className="text-muted">{t('my_spend.same', { count: earlierMonths, average })}</span>
      );
    }
    const isUp = 0 < change;
    const Icon = isUp ? TrendingUp : TrendingDown;
    return (
      <span
        className={cn('inline-flex items-center gap-1', isUp ? 'text-warning' : 'text-success')}
      >
        <Icon className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden />
        {t(isUp ? 'my_spend.above' : 'my_spend.below', {
          percent: Math.abs(change),
          count: earlierMonths,
          average,
        })}
      </span>
    );
  };

  return (
    <section
      className={cn(
        'border-border bg-surface flex items-end justify-between gap-4 rounded-[20px] border p-4',
        className,
      )}
      aria-labelledby="my-spend-title"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="my-spend-title" className="text-muted text-xs font-normal">
          {t('my_spend.label')}
        </h2>
        <bdi dir="ltr" className="text-foreground self-start text-2xl font-semibold tracking-tight">
          {toUIString(comparison.current)}
        </bdi>
        <span className="text-xs">{renderDelta()}</span>
        {others ? (
          <span className="text-muted text-xs">{t('other_currencies', { amounts: others })}</span>
        ) : null}
      </div>
      <SparkBars
        data={spark}
        ariaLabel={t('my_spend.trend_aria', { count: MONTHS })}
        className="shrink-0"
      />
    </section>
  );
};
