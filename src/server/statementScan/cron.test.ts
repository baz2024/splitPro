import { cadenceFromCron, nextRunDate } from '~/server/subscriptions/helpers';

import type { CalendarDate } from '../dataio/dates';
import { cadenceCron, previousCycleDate } from './cron';
import type { ScanCadence } from './types';

const midnight = ({ year, month, day }: CalendarDate) => new Date(Date.UTC(year, month - 1, day));
const hourBefore = (date: CalendarDate) => new Date(midnight(date).getTime() - 60 * 60 * 1000);

describe('previousCycleDate', () => {
  it('should step back one month, landing in the previous month', () => {
    expect(previousCycleDate({ year: 2026, month: 11, day: 10 }, 'monthly').toISOString()).toBe(
      '2026-10-10T12:00:00.000Z',
    );
  });

  it('should clamp to the last day of a shorter month', () => {
    expect(previousCycleDate({ year: 2026, month: 3, day: 31 }, 'monthly').toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });

  it('should cross the year boundary', () => {
    expect(previousCycleDate({ year: 2027, month: 1, day: 5 }, 'monthly').toISOString()).toBe(
      '2026-12-05T12:00:00.000Z',
    );
  });

  it('should step back a year for yearly plans', () => {
    expect(previousCycleDate({ year: 2028, month: 2, day: 29 }, 'yearly').toISOString()).toBe(
      '2027-02-28T12:00:00.000Z',
    );
  });

  it('should step back seven days for weekly plans', () => {
    expect(previousCycleDate({ year: 2026, month: 11, day: 3 }, 'weekly').toISOString()).toBe(
      '2026-10-27T12:00:00.000Z',
    );
  });
});

describe('cadenceCron', () => {
  describe('Monthly', () => {
    it('should run on the renewal day of every month', () => {
      expect(cadenceCron('monthly', { year: 2026, month: 11, day: 14 })).toBe('0 0 14 * *');
    });

    it('should use the backend last-day token for a month-end renewal', () => {
      expect(cadenceCron('monthly', { year: 2026, month: 11, day: 30 })).toBe('0 0 $ * *');
      expect(cadenceCron('monthly', { year: 2027, month: 1, day: 31 })).toBe('0 0 $ * *');
    });

    it('should keep day 29 or 30 when it is not the last day of the month', () => {
      expect(cadenceCron('monthly', { year: 2027, month: 1, day: 30 })).toBe('0 0 30 * *');
    });

    it('should keep day 28 even when February ends on it', () => {
      expect(cadenceCron('monthly', { year: 2027, month: 2, day: 28 })).toBe('0 0 28 * *');
    });
  });

  describe('Yearly', () => {
    it('should run on the renewal day and month', () => {
      expect(cadenceCron('yearly', { year: 2027, month: 3, day: 5 })).toBe('0 0 5 3 *');
    });

    it('should turn Feb 29 into the last day of February', () => {
      expect(cadenceCron('yearly', { year: 2028, month: 2, day: 29 })).toBe('0 0 $ 2 *');
    });
  });

  describe('Weekly', () => {
    it('should run on the renewal day of the week', () => {
      // 2026-11-02 is a Monday, 2026-11-08 a Sunday.
      expect(cadenceCron('weekly', { year: 2026, month: 11, day: 2 })).toBe('0 0 * * 1');
      expect(cadenceCron('weekly', { year: 2026, month: 11, day: 8 })).toBe('0 0 * * 0');
    });
  });

  describe('Next run', () => {
    const cases: [ScanCadence, CalendarDate][] = [
      ['monthly', { year: 2026, month: 11, day: 14 }],
      ['monthly', { year: 2026, month: 11, day: 30 }],
      ['monthly', { year: 2027, month: 2, day: 28 }],
      ['monthly', { year: 2027, month: 1, day: 30 }],
      ['yearly', { year: 2027, month: 3, day: 5 }],
      ['yearly', { year: 2028, month: 2, day: 29 }],
      ['weekly', { year: 2026, month: 11, day: 6 }],
    ];

    it.each(cases)('should next run a %s schedule on the renewal date %o', (cadence, date) => {
      const schedule = cadenceCron(cadence, date);
      expect(nextRunDate(schedule, hourBefore(date))).toEqual(midnight(date));
      expect(cadenceFromCron(schedule)).toBe(cadence);
    });
  });
});
