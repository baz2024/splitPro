import Link from 'next/link';
import React from 'react';

import { Money, type MoneyTone } from '~/components/Safi/Money';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type CapTone, capTone } from '~/lib/agentControls';
import { cn } from '~/lib/utils';

const RING_RADIUS = 28;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Percentage of `cap` used by `spent`, rounded down, without converting BigInt to float early. */
export const capPercent = (spent: bigint, cap: bigint): number =>
  0n >= cap ? 0 : Number((spent * 100n) / cap);

export const capHref = (projectId: number | null) =>
  null === projectId ? '/projects' : `/projects/${projectId}`;

/** Spend tone against a cap: green under it, amber near it, red at or over it. */
export const CAP_MONEY_TONE = {
  none: 'neutral',
  success: 'owed',
  warning: 'warn',
  danger: 'owe',
} as const satisfies Record<CapTone, MoneyTone>;

const RING_TONE = {
  none: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/** Spend-vs-cap donut: green under 80%, amber 80–99%, red at or over 100%. */
export const UsageRing: React.FC<{ percent: number; label: string }> = ({ percent, label }) => {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const filled = (clamped / 100) * RING_CIRCUMFERENCE;
  const tone = RING_TONE[capTone({ percent, hasCap: true })];

  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <circle
        cx="36"
        cy="36"
        r={RING_RADIUS}
        fill="none"
        className="stroke-default"
        strokeWidth="10"
      />
      <circle
        cx="36"
        cy="36"
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        className={cn(tone, 'transition-[stroke-dasharray] duration-500')}
        strokeWidth="10"
        strokeDasharray={`${filled} ${RING_CIRCUMFERENCE}`}
        transform="rotate(-90 36 36)"
      />
    </svg>
  );
};

interface UsageSummaryCardProps {
  total: bigint;
  cap: bigint | null;
  currency: string;
  project: { id: number; name: string } | null;
}

/**
 * Providers tab header: all AI & dev spend this month against the project budget it counts
 * toward (labelled as a project budget, not an agent cap), or a "Set a budget" link.
 */
export const UsageSummaryCard: React.FC<UsageSummaryCardProps> = ({
  total,
  cap,
  currency,
  project,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentsusage']);
  const { toUIString } = getCurrencyHelpersCached(currency);

  return (
    <section className="bg-surface border-border flex items-center justify-between gap-4 rounded-[20px] border p-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <Money
          amount={total}
          currency={currency}
          tone={
            null === cap
              ? 'neutral'
              : CAP_MONEY_TONE[capTone({ percent: capPercent(total, cap), hasCap: true })]
          }
          className="self-start text-2xl font-bold tracking-tight"
        />
        <span className="text-muted text-xs">{t('audit_g.spend_label')}</span>
      </div>

      {null !== cap && (
        <UsageRing
          percent={capPercent(total, cap)}
          label={t('summary.ring_label', {
            percent: capPercent(total, cap),
            cap: toUIString(cap),
          })}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col items-end text-end">
        {null !== cap ? (
          <>
            <Money amount={cap} currency={currency} className="text-2xl font-bold tracking-tight" />
            <span className="text-muted truncate text-xs">
              {project
                ? t('summary.cap_label', { project: project.name })
                : t('summary.cap_label_no_project')}
            </span>
          </>
        ) : (
          <>
            <span className="text-muted text-xs">{t('summary.no_cap')}</span>
            <Link
              href={capHref(project?.id ?? null)}
              className="text-accent focus-visible:ring-focus inline-flex min-h-11 items-center rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('summary.set_cap')}
            </Link>
          </>
        )}
      </div>
    </section>
  );
};
