import { reminderDaysFor } from './reminderPlan';

describe('reminderDaysFor', () => {
  describe('Not a subscription', () => {
    it('should never remind, even for a trial', () => {
      expect(reminderDaysFor({ cadence: 'yearly', flags: ['trial'] }, 'not_subscription')).toBe(
        null,
      );
      expect(reminderDaysFor({ cadence: 'monthly', flags: [] }, 'not_subscription')).toBe(null);
    });
  });

  describe('Trials', () => {
    it('should remind 2 days before for any other decision', () => {
      expect(reminderDaysFor({ cadence: null, flags: ['trial'] }, 'using')).toBe(2);
      expect(reminderDaysFor({ cadence: 'monthly', flags: ['trial'] }, 'not_sure')).toBe(2);
      expect(reminderDaysFor({ cadence: 'yearly', flags: ['trial'] }, 'cancel')).toBe(2);
    });
  });

  describe('Yearly', () => {
    it('should remind 14 days before for every decision', () => {
      expect(reminderDaysFor({ cadence: 'yearly', flags: [] }, 'using')).toBe(14);
      expect(reminderDaysFor({ cadence: 'yearly', flags: ['annual_soon'] }, 'not_sure')).toBe(14);
      expect(reminderDaysFor({ cadence: 'yearly', flags: [] }, 'cancel')).toBe(14);
    });
  });

  describe('Monthly', () => {
    it('should not remind when the user still uses it', () => {
      expect(reminderDaysFor({ cadence: 'monthly', flags: [] }, 'using')).toBe(null);
    });

    it('should remind 3 days before when unsure or cancelling', () => {
      expect(reminderDaysFor({ cadence: 'monthly', flags: ['price_rise'] }, 'not_sure')).toBe(3);
      expect(reminderDaysFor({ cadence: 'monthly', flags: ['duplicate'] }, 'cancel')).toBe(3);
    });
  });

  describe('Weekly', () => {
    it('should not remind when the user still uses it', () => {
      expect(reminderDaysFor({ cadence: 'weekly', flags: [] }, 'using')).toBe(null);
    });

    it('should remind 1 day before otherwise', () => {
      expect(reminderDaysFor({ cadence: 'weekly', flags: [] }, 'not_sure')).toBe(1);
      expect(reminderDaysFor({ cadence: 'weekly', flags: [] }, 'cancel')).toBe(1);
    });
  });
});
