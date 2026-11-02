import { reminderDueFor } from './dueDate';
import { buildReminderMessage, reminderLocale } from './message';

const at = (iso: string) => new Date(iso);

const due = (
  schedule: string,
  now: string,
  remindDaysBefore: number | null = 3,
  lastReminderSentFor: Date | null = null,
) => reminderDueFor({ schedule, remindDaysBefore, lastReminderSentFor }, at(now));

describe('reminderDueFor', () => {
  describe('Monthly renewals', () => {
    it('should be due exactly remindDaysBefore UTC days before the next run', () => {
      expect(due('0 0 15 * *', '2026-11-12T07:00:00Z')).toEqual(at('2026-11-15T00:00:00Z'));
    });

    it('should not be due a day early or a day late', () => {
      expect(due('0 0 15 * *', '2026-11-11T07:00:00Z')).toBeNull();
      expect(due('0 0 15 * *', '2026-11-13T07:00:00Z')).toBeNull();
    });

    it('should honour other reminder lengths', () => {
      expect(due('0 0 15 * *', '2026-11-14T07:00:00Z', 1)).toEqual(at('2026-11-15T00:00:00Z'));
      expect(due('0 0 15 * *', '2026-11-08T07:00:00Z', 7)).toEqual(at('2026-11-15T00:00:00Z'));
    });

    it('should cross a month boundary', () => {
      expect(due('0 0 2 * *', '2026-11-29T07:00:00Z')).toEqual(at('2026-12-02T00:00:00Z'));
    });
  });

  describe('Reminder off or already sent', () => {
    it('should never be due without a reminder', () => {
      expect(due('0 0 15 * *', '2026-11-12T07:00:00Z', null)).toBeNull();
      expect(due('0 0 15 * *', '2026-11-12T07:00:00Z', 0)).toBeNull();
    });

    it('should not remind twice for the same renewal', () => {
      expect(due('0 0 15 * *', '2026-11-12T07:00:00Z', 3, at('2026-11-15T00:00:00Z'))).toBeNull();
    });

    it('should remind again for the next renewal', () => {
      expect(due('0 0 15 * *', '2026-12-12T07:00:00Z', 3, at('2026-11-15T00:00:00Z'))).toEqual(
        at('2026-12-15T00:00:00Z'),
      );
    });

    it('should ignore schedules it cannot parse', () => {
      expect(due('not a cron', '2026-11-12T07:00:00Z')).toBeNull();
    });
  });

  describe('Timezones (schedules are stored in UTC)', () => {
    it('should count UTC days for a user ahead of UTC (local midnight is the previous UTC day)', () => {
      // Midnight on the 15th in UTC+3 is 21:00 UTC on the 14th.
      expect(due('0 21 14 * *', '2026-11-11T07:00:00Z')).toEqual(at('2026-11-14T21:00:00Z'));
      expect(due('0 21 14 * *', '2026-11-12T07:00:00Z')).toBeNull();
    });

    it('should count UTC days for a user behind UTC', () => {
      // Midnight on the 15th in UTC-5 is 05:00 UTC on the 15th.
      expect(due('0 5 15 * *', '2026-11-12T07:00:00Z')).toEqual(at('2026-11-15T05:00:00Z'));
    });

    it('should treat a run later today as day zero, not as the reminder day', () => {
      expect(due('0 23 12 * *', '2026-11-12T07:00:00Z')).toBeNull();
      expect(due('0 23 15 * *', '2026-11-12T07:00:00Z')).toEqual(at('2026-11-15T23:00:00Z'));
    });
  });

  describe('Month ends', () => {
    it('should remind before the last day of February', () => {
      expect(due('0 0 L * *', '2026-02-25T07:00:00Z')).toEqual(at('2026-02-28T00:00:00Z'));
    });

    it('should remind before the last day of a 30-day month', () => {
      expect(due('0 0 L * *', '2026-04-27T07:00:00Z')).toEqual(at('2026-04-30T00:00:00Z'));
    });

    it("should accept pg_cron's $ for the last day of the month", () => {
      expect(due('0 0 $ * *', '2026-01-28T07:00:00Z')).toEqual(at('2026-01-31T00:00:00Z'));
    });
  });

  describe('Yearly renewals', () => {
    it('should remind three days before a yearly renewal', () => {
      expect(due('0 0 1 3 *', '2027-02-26T07:00:00Z')).toEqual(at('2027-03-01T00:00:00Z'));
    });

    it('should count 29 February in a leap year', () => {
      expect(due('0 0 1 3 *', '2028-02-27T07:00:00Z')).toEqual(at('2028-03-01T00:00:00Z'));
      expect(due('0 0 1 3 *', '2028-02-26T07:00:00Z')).toBeNull();
    });

    it('should handle a leap-day plan stored as the last day of February', () => {
      expect(due('0 0 L 2 *', '2028-02-26T07:00:00Z')).toEqual(at('2028-02-29T00:00:00Z'));
      expect(due('0 0 L 2 *', '2027-02-25T07:00:00Z')).toEqual(at('2027-02-28T00:00:00Z'));
    });

    it('should cross the year boundary', () => {
      expect(due('0 0 2 1 *', '2026-12-30T07:00:00Z')).toEqual(at('2027-01-02T00:00:00Z'));
    });

    it('should not remind in other months', () => {
      expect(due('0 0 1 3 *', '2026-11-12T07:00:00Z')).toBeNull();
    });
  });
});

describe('buildReminderMessage', () => {
  it('should describe a split subscription', () => {
    const message = buildReminderMessage({
      name: 'Vercel Pro',
      amount: 2000n,
      currency: 'USD',
      days: 3,
      split: { kind: 'split', ways: 2 },
      locale: 'en',
    });
    expect(message.line).toBe('Vercel Pro renews in 3 days — $20 · split 2 ways');
    expect(message.title).toBe('Vercel Pro renews in 3 days');
    expect(message.body).toBe('$20 · split 2 ways');
  });

  it('should describe a personal subscription in the singular', () => {
    const message = buildReminderMessage({
      name: 'Linear',
      amount: 850n,
      currency: 'USD',
      days: 1,
      split: { kind: 'personal' },
      locale: 'en',
    });
    expect(message.line).toBe('Linear renews in 1 day — $8.50');
  });

  it('should write Arabic reminders', () => {
    const message = buildReminderMessage({
      name: 'Vercel Pro',
      amount: 2000n,
      currency: 'USD',
      days: 3,
      split: { kind: 'split', ways: 2 },
      locale: 'ar',
    });
    expect(message.line).toContain('Vercel Pro');
    expect(message.line).toContain('شخصين');
    expect(message.emailSubject).toBe('تذكير بالتجديد: Vercel Pro');
  });
});

describe('reminderLocale', () => {
  it('should use Arabic only for Arabic speakers', () => {
    expect(reminderLocale('ar')).toBe('ar');
    expect(reminderLocale('ar-SA')).toBe('ar');
    expect(reminderLocale('de')).toBe('en');
    expect(reminderLocale('')).toBe('en');
    expect(reminderLocale(null)).toBe('en');
  });
});
