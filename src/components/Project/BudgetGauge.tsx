import React from 'react';

import { cn } from '~/lib/utils';

interface BudgetGaugeProps {
  /** Share of the budget already spent, 0–100. */
  percentSpent: number;
  /** Where an even pace would be today, 0–100; draws a tick on the arc. */
  pacePercent?: number;
  /** Accessible description of the pace tick. */
  paceLabel?: string;
  isOver: boolean;
  label: string;
  value: string;
  caption: string;
  ariaLabel: string;
}

// 240° arc (from 210° to -30°) on a 100px radius, centred at (130, 130).
const ARC_PATH = 'M 43.4 180 A 100 100 0 1 1 216.6 180';

/**
 * Font size for the big amount, stepped by its length so it stays inside the arc (about 180px
 * wide at the text line) in every locale, e.g. "$2,000" vs "1,020.50 US$".
 */
export const gaugeValueClass = (value: string) => {
  // Ignore invisible bidi marks (Arabic currency formats) so they don't shrink the text.
  const { length } = value.replace(/[‎‏؜⁦-⁩]/g, '');
  if (7 >= length) {
    return 'text-[34px]';
  }
  if (9 >= length) {
    return 'text-[28px]';
  }
  if (11 >= length) {
    return 'text-2xl';
  }
  return 'text-xl';
};

/** Semicircle-style gauge from the approved Project budget design. */
export const BudgetGauge: React.FC<BudgetGaugeProps> = ({
  percentSpent,
  pacePercent,
  paceLabel,
  isOver,
  label,
  value,
  caption,
  ariaLabel,
}) => {
  const fill = Math.max(0, Math.min(100, percentSpent));
  const pace = undefined === pacePercent ? null : Math.max(0, Math.min(100, pacePercent));

  return (
    <section className="relative flex flex-col items-center pt-2" aria-label={ariaLabel}>
      <svg
        width="260"
        height="200"
        viewBox="0 0 260 200"
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        className="max-w-full rtl:-scale-x-100"
      >
        <path
          d={ARC_PATH}
          fill="none"
          className="stroke-muted/25"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {0 < fill ? (
          <path
            d={ARC_PATH}
            fill="none"
            pathLength={100}
            strokeDasharray={`${fill} 100`}
            className={cn(isOver ? 'stroke-danger' : 'stroke-accent', 'transition-all')}
            strokeWidth="16"
            strokeLinecap="round"
          />
        ) : null}
        {null !== pace && 0 < pace && 100 > pace ? (
          // A short notch across the track at today's even-pace point.
          <path
            d={ARC_PATH}
            fill="none"
            pathLength={100}
            strokeDasharray="0.6 100"
            strokeDashoffset={-pace}
            className="stroke-foreground"
            strokeWidth="24"
            data-testid="budget-gauge-pace"
          >
            {paceLabel ? <title>{paceLabel}</title> : null}
          </path>
        ) : null}
      </svg>
      <div className="absolute top-[68px] flex max-w-[184px] flex-col items-center text-center">
        <span className="text-muted text-xs">{label}</span>
        <span
          dir="ltr"
          className={cn(
            gaugeValueClass(value),
            'max-w-full truncate leading-tight font-bold tracking-tight whitespace-nowrap tabular-nums',
            isOver ? 'text-danger' : 'text-foreground',
          )}
        >
          {value}
        </span>
        <span className="text-muted text-xs">{caption}</span>
      </div>
    </section>
  );
};
