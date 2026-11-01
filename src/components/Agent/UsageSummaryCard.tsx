import Link from 'next/link';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';

const RING_RADIUS = 28;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Percentage of `cap` used by `spent`, rounded down, without converting BigInt to float early. */
export const capPercent = (spent: bigint, cap: bigint): number =>
  0n >= cap ? 0 : Number((spent * 100n) / cap);

export const capHref = (projectId: number | null) =>
  null === projectId ? '/groups' : `/groups/${projectId}`;

const UsageRing: React.FC<{ percent: number; label: string }> = ({ percent, label }) => {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const filled = (clamped / 100) * RING_CIRCUMFERENCE;
  const tone = 100 < percent ? 'text-danger' : 80 <= percent ? 'text-warning' : 'text-accent';

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={label}>
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

/** Big AI-spend number, spend-vs-cap ring and the cap (or a "Set a cap" link). */
export const UsageSummaryCard: React.FC<UsageSummaryCardProps> = ({
  total,
  cap,
  currency,
  project,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentsusage']);
  const { toUIString } = getCurrencyHelpersCached(currency);

  return (
    <section className="bg-surface border-border flex items-center justify-between gap-3 rounded-[20px] border p-4">
      <div className="flex min-w-0 flex-col">
        <span dir="ltr" className="self-start text-[26px] font-bold tracking-tight tabular-nums">
          {toUIString(total)}
        </span>
        <span className="text-muted text-xs">{t('summary.spend_label')}</span>
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

      <div className="flex min-w-0 flex-col items-end text-end">
        {null !== cap ? (
          <>
            <span dir="ltr" className="text-[26px] font-bold tracking-tight tabular-nums">
              {toUIString(cap)}
            </span>
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
