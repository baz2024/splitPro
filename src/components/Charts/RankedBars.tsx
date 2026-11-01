import React from 'react';

import { cn } from '~/lib/utils';

export interface RankedBarDatum {
  key: string;
  label: string;
  /** Optional second line under the label, e.g. "2 plans". */
  hint?: string;
  /** Value in any unit, for bar length only. */
  value: number;
  /** Formatted amount printed at the row end. */
  display: string;
  /** Formatted share, e.g. "42%". */
  share: string;
  /** The folded remainder: drawn in the quiet context step. */
  isOther?: boolean;
}

interface RankedBarsProps {
  data: RankedBarDatum[];
  ariaLabel: string;
  className?: string;
}

/**
 * Ranked horizontal bars, largest first, one hue. Lengths are relative to the largest bar so
 * small differences stay visible; every row prints its amount and share, so the list doubles as
 * the table view. Bars grow from the inline-start edge, so the chart mirrors in RTL.
 */
export const RankedBars: React.FC<RankedBarsProps> = ({ data, ariaLabel, className }) => {
  const max = Math.max(0, ...data.map((datum) => datum.value));

  return (
    <ol aria-label={ariaLabel} className={cn('m-0 flex list-none flex-col gap-3 p-0', className)}>
      {data.map((datum) => {
        const width = 0 < max && 0 < datum.value ? Math.max(2, (datum.value / max) * 100) : 0;
        return (
          <li key={datum.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{datum.label}</span>
                {datum.hint ? <span className="text-muted text-[11px]">{datum.hint}</span> : null}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span dir="ltr" className="font-semibold tabular-nums">
                  {datum.display}
                </span>
                <span className="text-muted w-10 text-end text-xs tabular-nums">{datum.share}</span>
              </span>
            </div>
            <div aria-hidden className="h-2">
              <div
                className={cn(
                  'h-2 rounded-e-[4px]',
                  datum.isOther ? 'bg-chart-bar-muted' : 'bg-chart-bar',
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
};
