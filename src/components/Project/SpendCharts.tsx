import React, { useState } from 'react';

import { ColumnChart } from '~/components/Charts/ColumnChart';
import { monthLabels } from '~/components/Charts/monthLabels';
import { RankedBars } from '~/components/Charts/RankedBars';
import {
  formatCompactMajor,
  formatCompactMoney,
  formatShare,
  minorToMajor,
  toLatinDigits,
} from '~/components/Charts/scale';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { getCategoryLabelKey } from '~/lib/category';
import { cn } from '~/lib/utils';
import { RANGE_PERIODS, SPEND_RANGES, type SpendRange } from '~/lib/spendRange';
import { type RouterOutputs, api } from '~/utils/api';

import { Money } from '../Safi/Money';
import { isolateLtr, useTzOffset } from './format';

type ProjectSpend = RouterOutputs['insights']['projectSpend'];
type Period = ProjectSpend['periods'][number];
type SourceFilter = 'all' | 'human' | 'agent';

const NS = ['insights', 'categories', 'common'];
const DEFAULT_RANGE: SpendRange = '6m';
/** On the daily chart, label every 7th day counted back from today. */
const DAY_LABEL_EVERY = 7;

const CARD = 'bg-surface border-border mt-4 flex flex-col gap-3 rounded-[20px] border px-4 py-4';

const SEGMENT_BASE =
  'focus-visible:ring-focus min-h-9 min-w-11 rounded-full px-3 text-xs font-medium outline-none focus-visible:ring-2';

/** Small pill segmented control (1M / 6M / 1Y, All / People / Agents). */
const PillSwitch = <K extends string>({
  items,
  selected,
  onChange,
  ariaLabel,
}: {
  items: readonly { id: K; label: string }[];
  selected: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className="bg-default flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
  >
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        role="radio"
        aria-checked={selected === item.id}
        onClick={() => onChange(item.id)}
        className={cn(
          SEGMENT_BASE,
          selected === item.id ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
        )}
      >
        {item.label}
      </button>
    ))}
  </div>
);

const dayLabel = (locale: string, period: Period, withMonth: boolean) =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    ...(withMonth ? { month: 'short' } : {}),
    timeZone: 'UTC',
    numberingSystem: 'latn',
  }).format(new Date(Date.UTC(period.year, period.month, period.day ?? 1)));

/** Keeps a short label on one line: its spaces become no-break spaces. */
const keepTogether = (text: string) => text.replace(/ /g, '\u00a0');

/**
 * "Jun – Nov 2026", "Dec 2025 – May 2026" or "3 Oct – 1 Nov": the span the chart covers, in
 * short month names throughout, kept on one line.
 */
const rangeSpan = (locale: string, spend: ProjectSpend) => {
  const first = spend.periods[0];
  const last = spend.periods.at(-1);
  if (!first || !last) {
    return '';
  }
  if ('day' === spend.granularity) {
    return keepTogether(`${dayLabel(locale, first, true)} – ${dayLabel(locale, last, true)}`);
  }
  const from = monthLabels(locale, first.year, first.month);
  const to = monthLabels(locale, last.year, last.month).shortYear;
  return keepTogether(`${first.year === last.year ? from.short : from.shortYear} – ${to}`);
};

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

const SpendTrend: React.FC<{
  spend: ProjectSpend;
  range: SpendRange;
  onRangeChange: (range: SpendRange) => void;
}> = ({ spend, range, onRangeChange }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const { toUIString } = getCurrencyHelpersCached(spend.currency);
  const locale = i18n.language;
  const isDaily = 'day' === spend.granularity;
  const lastIndex = spend.periods.length - 1;

  const data = spend.periods.map((period, index) => {
    const positive = 0n < period.total ? period.total : 0n;
    const isLast = lastIndex === index;
    const label = isDaily
      ? 0 === (lastIndex - index) % DAY_LABEL_EVERY
        ? dayLabel(locale, period, false)
        : ''
      : monthLabels(locale, period.year, period.month).short;
    const longLabel = isDaily
      ? dayLabel(locale, period, true)
      : monthLabels(locale, period.year, period.month).long;
    return {
      key: period.key,
      label,
      fullLabel: isLast
        ? t(isDaily ? 'trend.today' : 'trend.this_month', { month: longLabel, day: longLabel })
        : longLabel,
      value: minorToMajor(positive, spend.currency),
      display: toUIString(period.total),
      capLabel: formatCompactMoney(positive, spend.currency, locale),
      highlight: isLast,
    };
  });

  // A monthly budget only makes sense against monthly bars.
  const reference =
    spend.budget && !isDaily
      ? {
          value: minorToMajor(spend.budget, spend.currency),
          label: t('trend.budget_line', { amount: isolateLtr(toUIString(spend.budget)) }),
        }
      : null;
  const average =
    null === spend.average
      ? null
      : {
          value: minorToMajor(spend.average, spend.currency),
          label: t('trend.average_line', { amount: isolateLtr(toUIString(spend.average)) }),
        };
  const span = rangeSpan(locale, spend);

  return (
    <section className={CARD} aria-labelledby="project-trend-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="project-trend-title" className="text-base font-semibold">
            {t(isDaily ? 'trend.title_daily' : 'trend.title')}
          </h2>
          <p className="text-muted text-xs">{spend.currency}</p>
        </div>
        <PillSwitch
          ariaLabel={t('range.label')}
          // Western digits like every other number on screen (the Arabic copy says "٦ أشهر").
          items={SPEND_RANGES.map((id) => ({ id, label: toLatinDigits(t(`range.${id}`)) }))}
          selected={range}
          onChange={onRangeChange}
        />
      </div>

      {/* Hero total with the average and the span it covers. */}
      <div className="flex flex-col">
        <span className="text-muted text-xs">{t('trend.spent_label')}</span>
        <Money
          amount={spend.total}
          currency={spend.currency}
          className="self-start text-[28px] leading-tight font-bold"
        />
        <span className="text-muted text-xs">
          {null === spend.average
            ? span
            : t(isDaily ? 'trend.avg_per_day' : 'trend.avg_per_month', {
                amount: isolateLtr(toUIString(spend.average)),
                range: span,
              })}
        </span>
      </div>

      <ColumnChart
        data={data}
        reference={reference}
        average={average}
        formatTick={(value) => formatCompactMajor(value, spend.currency, locale)}
        ariaLabel={
          isDaily
            ? t('trend.aria_daily', { count: RANGE_PERIODS['1m'] })
            : t('trend.aria', { count: spend.periods.length })
        }
        tableHeaders={[isDaily ? t('table.day') : t('table.month'), t('table.amount')]}
        tableToggleLabel={t('table.show')}
      />
      <OtherCurrenciesNote spend={spend} />
    </section>
  );
};

const CategoryBreakdown: React.FC<{ spend: ProjectSpend }> = ({ spend }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(NS);
  const { toUIString } = getCurrencyHelpersCached(spend.currency);
  const [source, setSource] = useState<SourceFilter>('all');

  const categoryName = (category: string) => {
    const key = getCategoryLabelKey(category);
    return key ? t(key, { ns: 'categories' }) : category;
  };

  const items = spend.categoriesBySource[source];
  const data = items.map((item) => ({
    key: item.isOther ? '__other__' : item.key,
    label: item.isOther ? t('category.other') : categoryName(item.key),
    value: minorToMajor(item.total, spend.currency),
    display: toUIString(item.total),
    share: formatShare(item.percent, i18n.language),
    isOther: item.isOther,
  }));

  return (
    <section className={CARD} aria-labelledby="project-category-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="project-category-title" className="text-base font-semibold">
            {t('category.title')}
          </h2>
          <p className="text-muted text-xs">
            {t('category.subtitle_range', {
              range: rangeSpan(i18n.language, spend),
              currency: spend.currency,
            })}
          </p>
        </div>
        <PillSwitch
          ariaLabel={t('category.source_label')}
          items={[
            { id: 'all' as const, label: t('category.sources.all') },
            { id: 'human' as const, label: t('category.sources.human') },
            { id: 'agent' as const, label: t('category.sources.agent') },
          ]}
          selected={source}
          onChange={setSource}
        />
      </div>
      <p className="text-muted text-xs">
        {t('category.source_totals', {
          human: isolateLtr(toUIString(spend.sources.human)),
          agent: isolateLtr(toUIString(spend.sources.agent)),
        })}
      </p>
      {0 === data.length ? (
        <p className="text-muted text-sm">
          {'agent' === source
            ? t('category.agent_empty')
            : 'human' === source
              ? t('category.human_empty')
              : t('category.empty')}
        </p>
      ) : (
        <RankedBars data={data} ariaLabel={t('category.title')} />
      )}
      {'agent' === source ? <p className="text-muted text-xs">{t('category.agent_hint')}</p> : null}
    </section>
  );
};

/**
 * Project charts: spend per day (1M) or month (6M / 1Y) with a hero total, a dotted average line
 * and the budget line, then spend by category over the same range, filterable to costs added by
 * people or reported by coding agents. Hidden until the project has any spend.
 */
export const ProjectSpendCharts: React.FC<{ groupId: number }> = ({ groupId }) => {
  const tzOffset = useTzOffset();
  const [range, setRange] = useState<SpendRange>(DEFAULT_RANGE);
  const spendQuery = api.insights.projectSpend.useQuery(
    { groupId, tzOffset, range },
    // Keep the previous range on screen while the next one loads.
    { enabled: !Number.isNaN(groupId), placeholderData: (previous) => previous },
  );
  const spend = spendQuery.data;

  // Hide only when the project has never had spend; an empty 1M range still shows the switch.
  if (!spend || (!spend.hasData && DEFAULT_RANGE === range)) {
    return null;
  }

  return (
    <>
      <SpendTrend spend={spend} range={range} onRangeChange={setRange} />
      <CategoryBreakdown spend={spend} />
    </>
  );
};
