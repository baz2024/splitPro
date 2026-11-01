import React from 'react';

import { cn } from '~/lib/utils';

interface BudgetGaugeProps {
  /** Share of the budget already spent, 0–100. */
  percentSpent: number;
  isOver: boolean;
  label: string;
  value: string;
  caption: string;
  ariaLabel: string;
}

// 240° arc (from 210° to -30°) on a 100px radius, centred at (130, 130).
const ARC_PATH = 'M 43.4 180 A 100 100 0 1 1 216.6 180';

/** Semicircle-style gauge from the approved Project budget design. */
export const BudgetGauge: React.FC<BudgetGaugeProps> = ({
  percentSpent,
  isOver,
  label,
  value,
  caption,
  ariaLabel,
}) => {
  const fill = Math.max(0, Math.min(100, percentSpent));

  return (
    <section className="relative flex flex-col items-center pt-2" aria-label={ariaLabel}>
      <svg
        width="260"
        height="200"
        viewBox="0 0 260 200"
        role="img"
        aria-label={ariaLabel}
        className="max-w-full rtl:-scale-x-100"
      >
        <path
          d={ARC_PATH}
          fill="none"
          className="stroke-default"
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
      </svg>
      <div className="absolute top-[68px] flex flex-col items-center text-center">
        <span className="text-muted text-xs">{label}</span>
        <span
          dir="ltr"
          className={cn(
            'text-[34px] leading-tight font-bold tracking-tight',
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
