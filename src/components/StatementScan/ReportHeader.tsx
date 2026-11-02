import { CalendarClockIcon, CopyIcon, FlaskConicalIcon, TrendingUpIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { Card } from '~/components/DataIO/ui';
import { isolateLtr } from '~/components/Project/format';
import { cn } from '~/lib/utils';
import { SCAN_FLAGS, type ScanFlag, type ScanTotals } from '~/server/statementScan/types';

import { formatCount, formatRange, moneyText } from './format';
import { STATEMENT_SCAN_NAMESPACES, type ScanSession } from './types';

const FLAG_ICONS = {
  trial: FlaskConicalIcon,
  duplicate: CopyIcon,
  price_rise: TrendingUpIcon,
  annual_soon: CalendarClockIcon,
} as const satisfies Record<ScanFlag, unknown>;

interface ReportHeaderProps {
  totals: ScanTotals[];
  report: ScanSession['report'];
}

/** The one headline first ("$1,140/yr at risk"), then where that money comes from. */
export const ReportHeader: React.FC<ReportHeaderProps> = ({ totals, report }) => {
  const { t, i18n } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const locale = i18n.language;
  const [primary, ...others] = totals;
  const found = totals.reduce((sum, total) => sum + total.subscriptions, 0);

  const range =
    report?.from && report.to
      ? t('report.range', {
          range: isolateLtr(formatRange(report.from, report.to, locale)),
          rows: report.scannedRows,
        })
      : null;

  if (!primary || 0 === found) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-foreground text-sm font-medium">{t('report.none_found')}</p>
        {range ? <p className="text-muted text-xs">{range}</p> : null}
      </Card>
    );
  }

  const money = (amount: bigint, currency: string) =>
    isolateLtr(moneyText({ amount, currency, locale, whole: true }));
  const counts = SCAN_FLAGS.map((flag) => ({
    flag,
    count: totals.reduce((sum, total) => sum + total.counts[flag], 0),
  })).filter(({ count }) => 0 < count);
  const otherAtRisk = others.filter((total) => 0n < total.atRiskYearlyMinor);
  const hasRisk = 0n < primary.atRiskYearlyMinor;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          {hasRisk ? t('report.label') : t('report.label_total')}
        </p>
        <p
          className={cn(
            'text-foreground leading-tight font-semibold tabular-nums',
            hasRisk ? 'text-[28px]' : 'text-2xl',
          )}
          data-testid="scan-headline"
        >
          {hasRisk
            ? t('report.at_risk', { amount: money(primary.atRiskYearlyMinor, primary.currency) })
            : t('report.total_yearly', { amount: money(primary.yearlyMinor, primary.currency) })}
        </p>
        {hasRisk ? (
          <p className="text-muted text-sm">
            {t('report.of_total', {
              amount: money(primary.yearlyMinor, primary.currency),
              count: found,
            })}
          </p>
        ) : null}
        {0 < otherAtRisk.length ? (
          <p className="text-muted text-xs">
            {t('report.other_currencies', {
              amounts: otherAtRisk
                .map((total) => money(total.atRiskYearlyMinor, total.currency))
                .join(' · '),
            })}
          </p>
        ) : null}
        {hasRisk && !range ? null : (
          <p className="text-muted text-xs">
            {hasRisk ? null : t('report.found', { count: found })}
            {!hasRisk && range ? ' · ' : null}
            {range}
          </p>
        )}
      </div>

      {0 < counts.length ? (
        <ul aria-label={t('report.breakdown')} className="grid grid-cols-2 gap-2">
          {counts.map(({ flag, count }) => {
            const Icon = FLAG_ICONS[flag];
            return (
              <li
                key={flag}
                className="bg-background flex min-h-[72px] flex-col justify-between gap-1 rounded-2xl p-3"
              >
                <span className="text-warning flex items-center justify-between gap-2">
                  <span className="text-foreground text-xl font-semibold tabular-nums">
                    {formatCount(count, locale)}
                  </span>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="text-muted text-xs leading-snug">{t(`report.flags.${flag}`)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted text-sm">{t('report.nothing_wasted')}</p>
      )}
    </Card>
  );
};
