import React from 'react';

import { ColumnChart } from '~/components/Charts/ColumnChart';
import { monthLabels } from '~/components/Charts/monthLabels';
import { RankedBars } from '~/components/Charts/RankedBars';
import {
  formatCompactMajor,
  formatCompactMoney,
  formatShare,
  minorToMajor,
} from '~/components/Charts/scale';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { getCategoryLabelKey } from '~/lib/category';
import { type RouterOutputs, api } from '~/utils/api';

import { isolateLtr, useTzOffset } from './format';

type ProjectSpend = RouterOutputs['insights']['projectSpend'];

const NS = ['insights', 'categories', 'common'];
const TREND_MONTHS = 6;

const CARD = 'bg-surface border-border mt-4 flex flex-col gap-3 rounded-[20px] border px-4 py-4';

const OtherCurrenciesNote: React.FC<{ spend: ProjectSpend }> = ({ spend }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  if (0 === spend.otherCurrencies.length) {
    return null;
  }
  const amounts = spend.otherCurrencies
    .map(({ currency, total }) => isolateLtr(getCurrencyHelpersCached(currency).toUIString(total)))
    .join(' · ');
  return <p className="text-muted text-xs">{t('other_currencies', { amounts })}</p>;
};

const MonthlyTrend: React.FC<{ spend: ProjectSpend }> = ({ spend }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const { toUIString } = getCurrencyHelpersCached(spend.currency);
  const locale = i18n.language;
  const lastIndex = spend.months.length - 1;

  const data = spend.months.map((month, index) => {
    const labels = monthLabels(locale, month.year, month.month);
    const positive = 0n < month.total ? month.total : 0n;
    return {
      key: month.key,
      label: labels.short,
      fullLabel: lastIndex === index ? t('trend.this_month', { month: labels.long }) : labels.long,
      value: minorToMajor(positive, spend.currency),
      display: toUIString(month.total),
      capLabel: formatCompactMoney(positive, spend.currency, locale),
      highlight: lastIndex === index,
    };
  });

  const reference = spend.budget
    ? {
        value: minorToMajor(spend.budget, spend.currency),
        label: t('trend.budget_line', { amount: isolateLtr(toUIString(spend.budget)) }),
      }
    : null;

  return (
    <section className={CARD} aria-labelledby="project-trend-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="project-trend-title" className="text-base font-semibold">
          {t('trend.title')}
        </h2>
        <p className="text-muted text-xs">
          {t('trend.subtitle', { count: TREND_MONTHS, currency: spend.currency })}
        </p>
      </div>
      <ColumnChart
        data={data}
        reference={reference}
        formatTick={(value) => formatCompactMajor(value, spend.currency, locale)}
        ariaLabel={t('trend.aria', { count: TREND_MONTHS })}
        tableHeaders={[t('table.month'), t('table.amount')]}
        tableToggleLabel={t('table.show')}
      />
      <OtherCurrenciesNote spend={spend} />
    </section>
  );
};

const CategoryBreakdown: React.FC<{ spend: ProjectSpend }> = ({ spend }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const { toUIString } = getCurrencyHelpersCached(spend.currency);

  const categoryName = (category: string) => {
    const key = getCategoryLabelKey(category);
    return key ? t(key, { ns: 'categories' }) : category;
  };

  const data = spend.categories.map((item) => ({
    key: item.isOther ? '__other__' : item.key,
    label: item.isOther ? t('category.other') : categoryName(item.key),
    value: minorToMajor(item.total, spend.currency),
    display: toUIString(item.total),
    share: formatShare(item.percent, i18n.language),
    isOther: item.isOther,
  }));

  return (
    <section className={CARD} aria-labelledby="project-category-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="project-category-title" className="text-base font-semibold">
          {t('category.title')}
        </h2>
        <p className="text-muted text-xs">
          {t('category.subtitle', { count: TREND_MONTHS, currency: spend.currency })}
        </p>
      </div>
      {0 === data.length ? (
        <p className="text-muted text-sm">{t('category.empty')}</p>
      ) : (
        <RankedBars data={data} ariaLabel={t('category.title')} />
      )}
    </section>
  );
};

/**
 * Project charts: total spend per month (current month highlighted, budget line when set) and
 * spend by category over the same months. Hidden until the project has any spend.
 */
export const ProjectSpendCharts: React.FC<{ groupId: number }> = ({ groupId }) => {
  const tzOffset = useTzOffset();
  const spendQuery = api.insights.projectSpend.useQuery(
    { groupId, tzOffset, months: TREND_MONTHS },
    { enabled: !Number.isNaN(groupId) },
  );
  const spend = spendQuery.data;

  if (!spend?.hasData) {
    return null;
  }

  return (
    <>
      <MonthlyTrend spend={spend} />
      <CategoryBreakdown spend={spend} />
    </>
  );
};
