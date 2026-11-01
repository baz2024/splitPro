import { daysUntil, nextRunDate } from '~/server/subscriptions/helpers';

/** The reminder the Add subscription form turns on by default. */
export const DEFAULT_REMIND_DAYS_BEFORE = 3;
export const MAX_REMIND_DAYS_BEFORE = 30;

export interface ReminderCandidate {
  /** Backend (UTC) cron schedule of the recurring job. */
  schedule: string;
  remindDaysBefore: number | null;
  lastReminderSentFor: Date | null;
}

/**
 * The renewal date a reminder is due for today, or null. A reminder is due when the job's next
 * run is exactly `remindDaysBefore` UTC calendar days after `now` and no reminder has been sent
 * for that renewal yet.
 */
export const reminderDueFor = (candidate: ReminderCandidate, now: Date): Date | null => {
  const { schedule, remindDaysBefore, lastReminderSentFor } = candidate;
  if (null === remindDaysBefore || 0 >= remindDaysBefore) {
    return null;
  }

  const renewal = nextRunDate(schedule, now);
  if (!renewal) {
    return null;
  }
  if (remindDaysBefore !== daysUntil(renewal, now)) {
    return null;
  }
  if (lastReminderSentFor && lastReminderSentFor.getTime() === renewal.getTime()) {
    return null;
  }
  return renewal;
};
