import { type PaceSummary } from '~/server/project/budget';

export type PaceTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface PaceMessage {
  /** Translation key in the `common` namespace. */
  key: `audit_c.pace.${'on_track' | 'at_risk' | 'over'}` | `audit_f.pace.${'early' | 'over_early'}`;
  values: Record<string, string>;
  tone: PaceTone;
}

/** Keeps a short date such as "30 Nov" on one line inside the sentence. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);
const noWrap = (text: string) => text.replace(/\s+/g, NO_BREAK_SPACE);

/**
 * Turns the month's pace into the one sentence under the project title, so the header never
 * shows "over pace" next to a "left to spend" figure without saying how they relate.
 * Early in the month there is no projection, only what has been spent and what is left.
 * `money` formats minor units; `monthEnd` is the last day of the month, e.g. "30 Nov".
 */
export const paceMessage = (
  pace: PaceSummary,
  { money, monthEnd }: { money: (minor: bigint) => string; monthEnd: string },
): PaceMessage | null => {
  const date = noWrap(monthEnd);
  switch (pace.kind) {
    case 'early':
      return {
        key: 'audit_f.pace.early',
        values: { spent: money(pace.spent), left: money(pace.left) },
        tone: 'neutral',
      };
    case 'on_track':
      return { key: 'audit_c.pace.on_track', values: { left: money(pace.left) }, tone: 'success' };
    case 'at_risk':
      return {
        key: 'audit_c.pace.at_risk',
        values: { projected: money(pace.projected), date, over: money(pace.overBy) },
        tone: 'warning',
      };
    case 'over':
      if (null === pace.projected) {
        return {
          key: 'audit_f.pace.over_early',
          values: { over: money(pace.overBy) },
          tone: 'danger',
        };
      }
      return {
        key: 'audit_c.pace.over',
        values: { over: money(pace.overBy), projected: money(pace.projected), date },
        tone: 'danger',
      };
    default:
      return null;
  }
};

/** "30 Nov" style label for the last day of a 0-based month, in the viewer's locale. */
export const monthEndLabel = (locale: string, year: number, month: number) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month + 1, 0)),
  );
