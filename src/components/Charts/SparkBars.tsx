import React from 'react';

import { cn } from '~/lib/utils';

import { toPlotPercent } from './scale';

export interface SparkDatum {
  key: string;
  value: number;
  /** "June 2026: $120.00" — read by screen readers and shown as the native tooltip. */
  description: string;
  highlight?: boolean;
}

interface SparkBarsProps {
  data: SparkDatum[];
  ariaLabel: string;
  className?: string;
}

/**
 * Stat-tile trend: tiny columns, earlier periods in the quiet step, the current one in the
 * accent. The tile's own text carries the headline numbers; each column's value is in the list
 * read by screen readers and in its native tooltip.
 */
export const SparkBars: React.FC<SparkBarsProps> = ({ data, ariaLabel, className }) => {
  const max = Math.max(0, ...data.map((datum) => datum.value));

  return (
    <ul
      aria-label={ariaLabel}
      className={cn('m-0 flex h-10 list-none items-end gap-1 p-0', className)}
    >
      {data.map((datum) => (
        <li
          key={datum.key}
          title={datum.description}
          className="flex h-full w-2.5 items-end justify-center"
        >
          <span className="sr-only">{datum.description}</span>
          <span
            aria-hidden
            className={cn(
              'w-full rounded-t-[3px]',
              datum.highlight ? 'bg-chart-bar' : 'bg-chart-bar-muted',
            )}
            style={{
              height: 0 < datum.value ? `${Math.max(6, toPlotPercent(datum.value, max))}%` : '1px',
            }}
          />
        </li>
      ))}
    </ul>
  );
};
