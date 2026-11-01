import React from 'react';

import { cn } from '~/lib/utils';

import { niceCeil, toPlotPercent } from './scale';

export interface ColumnDatum {
  key: string;
  /** Short axis label, e.g. "Jun". */
  label: string;
  /** Long label for the tooltip and table, e.g. "June 2026". */
  fullLabel: string;
  /** Value in major units, for geometry only. */
  value: number;
  /** Formatted full amount for the tooltip and table. */
  display: string;
  /** Formatted compact amount printed on the cap of a highlighted column. */
  capLabel?: string;
  /** The column the story is about (the current month): drawn in the accent, others muted. */
  highlight?: boolean;
}

export interface ColumnReference {
  value: number;
  /** Visible label beside the line, e.g. "Budget $2,000". */
  label: string;
}

interface ColumnChartProps {
  data: ColumnDatum[];
  reference?: ColumnReference | null;
  /** Compact tick label for a value in major units. */
  formatTick: (value: number) => string;
  /** Accessible summary of the whole chart. */
  ariaLabel: string;
  /** Column headers for the table view: [period, amount]. */
  tableHeaders: [string, string];
  /** Summary text of the "view as table" disclosure. */
  tableToggleLabel: string;
  className?: string;
}

const PLOT_HEIGHT = 144;

/**
 * Single-series column chart in plain HTML, so the time axis mirrors with the document direction
 * (RTL) and text renders natively. Emphasis form: the highlighted column is the accent, context
 * columns a quiet step of the same hue. A solid hairline marks an optional reference (budget).
 * Every value is also in the table view below the chart; hover and focus show a tooltip.
 */
export const ColumnChart: React.FC<ColumnChartProps> = ({
  data,
  reference,
  formatTick,
  ariaLabel,
  tableHeaders,
  tableToggleLabel,
  className,
}) => {
  const peak = Math.max(0, ...data.map((datum) => datum.value), reference?.value ?? 0);
  const max = niceCeil(peak);
  const ticks = [max, max / 2, 0];
  const referencePercent = reference ? toPlotPercent(reference.value, max) : null;

  return (
    <figure
      className={cn('m-0 flex flex-col gap-2', className)}
      aria-label={reference ? `${ariaLabel}. ${reference.label}` : ariaLabel}
    >
      <div className="relative" style={{ height: PLOT_HEIGHT }}>
        {/* Recessive solid hairline grid with compact ticks on the inline-start edge. */}
        {ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden
            className={cn(
              'absolute inset-x-0 flex items-center gap-2',
              0 === tick ? 'border-chart-baseline' : 'border-chart-grid',
            )}
            style={{ bottom: `${toPlotPercent(tick, max)}%`, transform: 'translateY(50%)' }}
          >
            <span className="text-muted w-10 shrink-0 text-[10px] leading-none tabular-nums">
              {formatTick(tick)}
            </span>
            <span
              className={cn('h-px flex-1', 0 === tick ? 'bg-chart-baseline' : 'bg-chart-grid')}
            />
          </div>
        ))}

        <div className="absolute inset-y-0 start-12 end-0 flex items-end">
          {data.map((datum) => {
            const height = toPlotPercent(datum.value, max);
            return (
              <div
                key={datum.key}
                role="img"
                tabIndex={0}
                aria-label={`${datum.fullLabel}: ${datum.display}`}
                className="group focus-visible:ring-focus relative flex h-full flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2"
              >
                <div
                  className={cn(
                    'w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80',
                    datum.highlight ? 'bg-chart-bar' : 'bg-chart-bar-muted',
                  )}
                  // A zero month still shows a sliver on the baseline so the slot reads as "none".
                  style={{ height: 0 < height ? `${height}%` : '1px' }}
                />
                {datum.highlight && datum.capLabel ? (
                  <span
                    aria-hidden
                    dir="ltr"
                    className="text-foreground pointer-events-none absolute mb-1 text-[11px] font-semibold whitespace-nowrap group-hover:invisible group-focus-visible:invisible"
                    style={{ bottom: `${height}%` }}
                  >
                    {datum.capLabel}
                  </span>
                ) : null}
                <div
                  role="tooltip"
                  className="bg-overlay text-overlay-foreground border-border pointer-events-none absolute z-10 mb-2 hidden flex-col items-center rounded-lg border px-2.5 py-1.5 shadow-md group-hover:flex group-focus-visible:flex"
                  style={{ bottom: `${height}%` }}
                >
                  <span dir="ltr" className="text-xs font-semibold whitespace-nowrap">
                    {datum.display}
                  </span>
                  <span className="text-muted text-[11px] whitespace-nowrap">
                    {datum.fullLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {reference && null !== referencePercent ? (
          <div
            aria-hidden
            className="pointer-events-none absolute start-12 end-0 flex flex-col items-start"
            style={{ bottom: `${referencePercent}%` }}
          >
            <span className="bg-surface text-muted mb-0.5 rounded px-1 text-[10px] leading-tight">
              {reference.label}
            </span>
            <span className="bg-chart-reference h-px w-full opacity-70" />
          </div>
        ) : null}
      </div>

      <div aria-hidden className="ms-12 flex">
        {data.map((datum) => (
          <span
            key={datum.key}
            className={cn(
              'flex-1 text-center text-[11px]',
              datum.highlight ? 'text-foreground font-semibold' : 'text-muted',
            )}
          >
            {datum.label}
          </span>
        ))}
      </div>

      <details>
        <summary className="text-accent focus-visible:ring-focus inline-flex min-h-11 cursor-pointer items-center rounded-md text-xs focus-visible:ring-2 focus-visible:outline-none">
          {tableToggleLabel}
        </summary>
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 text-start font-normal">
                {tableHeaders[0]}
              </th>
              <th scope="col" className="py-1 text-end font-normal">
                {tableHeaders[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key} className="border-border border-t">
                <th scope="row" className="py-1.5 text-start font-normal">
                  {datum.fullLabel}
                </th>
                <td className="py-1.5 text-end tabular-nums">
                  <span dir="ltr">{datum.display}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
};
