import type { ScanDecision, ScanItem } from './types';

/**
 * Days before the next renewal to remind about a confirmed statement-scan subscription,
 * or null for no reminder.
 * - not a subscription: nothing to remind about.
 * - trials: 2 days, enough to cancel before the first full charge.
 * - yearly: 14 days, a big charge worth planning for whatever the decision.
 * - monthly / weekly in use: no reminder; otherwise 3 days (monthly) or 1 day (weekly).
 */
export const reminderDaysFor = (
  item: Pick<ScanItem, 'cadence' | 'flags'>,
  decision: ScanDecision,
): number | null => {
  if ('not_subscription' === decision) {
    return null;
  }
  if (item.flags.includes('trial')) {
    return 2;
  }
  if ('yearly' === item.cadence) {
    return 14;
  }
  if ('using' === decision) {
    return null;
  }
  if ('weekly' === item.cadence) {
    return 1;
  }
  return 3;
};
