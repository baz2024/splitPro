import {
  TECH_CATEGORY_OPTIONS,
  USAGE_SERVICES,
  addMonthsClamped,
  buildSubscriptionDescription,
  buildUsageDescription,
  cadenceToCron,
  defaultNextRenewal,
  fromMonthInputValue,
  lastChargeDate,
  parseCadence,
  parseCostType,
  parseServiceQuery,
  toMonthInputValue,
  usageExpenseDate,
} from './addCost';

describe('addCost', () => {
  describe('parseCostType', () => {
    it('should open the subscription tab for type=subscription', () => {
      expect(parseCostType({ type: 'subscription' })).toBe('subscription');
    });

    it('should open the usage tab for type=usage', () => {
      expect(parseCostType({ type: ['usage'] })).toBe('usage');
    });

    it('should open the Scan segment for mode=scan links', () => {
      expect(parseCostType({ mode: 'scan' })).toBe('scan');
      expect(parseCostType({ mode: ['scan'], groupId: '7' })).toBe('scan');
    });

    it('should default to one-off for manual links and unknown values', () => {
      expect(parseCostType({ mode: 'manual', friendId: '3' })).toBe('oneoff');
      expect(parseCostType({ groupId: '7' })).toBe('oneoff');
      expect(parseCostType({ type: 'bogus' })).toBe('oneoff');
      expect(parseCostType({})).toBe('oneoff');
    });
  });

  describe('parseServiceQuery', () => {
    it('should resolve catalog ids and ignore unknown services', () => {
      expect(parseServiceQuery({ service: 'vercel' })?.name).toBe('Vercel');
      expect(parseServiceQuery({ service: 'nope-service' })).toBeUndefined();
      expect(parseServiceQuery({})).toBeUndefined();
    });
  });

  describe('parseCadence', () => {
    it('should default to monthly', () => {
      expect(parseCadence('yearly')).toBe('yearly');
      expect(parseCadence(undefined)).toBe('monthly');
    });
  });

  describe('buildSubscriptionDescription', () => {
    it('should join service and plan', () => {
      expect(buildSubscriptionDescription('Vercel', 'Pro')).toBe('Vercel Pro');
    });

    it('should drop an empty plan', () => {
      expect(buildSubscriptionDescription(' Figma ', '  ')).toBe('Figma');
    });
  });

  describe('buildUsageDescription', () => {
    it('should name the service and month', () => {
      expect(buildUsageDescription('Anthropic', new Date(2026, 10, 1))).toBe(
        'Anthropic API · Nov 2026',
      );
    });

    it('should keep Latin digits in other locales', () => {
      expect(buildUsageDescription('OpenAI', new Date(2026, 10, 1), 'ar')).toMatch(/2026$/);
    });
  });

  describe('addMonthsClamped', () => {
    it('should clamp to the end of shorter months', () => {
      const result = addMonthsClamped(new Date(2026, 0, 31), 1);
      expect([result.getMonth(), result.getDate()]).toEqual([1, 28]);
    });

    it('should go back across a year boundary', () => {
      const result = addMonthsClamped(new Date(2026, 0, 15), -1);
      expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2025, 11, 15]);
    });
  });

  describe('defaultNextRenewal', () => {
    it('should be one period after today', () => {
      const today = new Date(2026, 10, 1);
      expect(defaultNextRenewal('monthly', today).getMonth()).toBe(11);
      expect(defaultNextRenewal('yearly', today).getFullYear()).toBe(2027);
    });
  });

  describe('lastChargeDate', () => {
    const today = new Date(2026, 10, 1, 12);

    it('should be one period before the next renewal', () => {
      const result = lastChargeDate('monthly', new Date(2026, 11, 1), today);
      expect([result.getMonth(), result.getDate()]).toEqual([10, 1]);
    });

    it('should never be in the future', () => {
      expect(lastChargeDate('monthly', new Date(2027, 2, 1), today)).toBe(today);
    });

    it('should step back a full year for yearly plans', () => {
      expect(lastChargeDate('yearly', new Date(2027, 5, 10), today).getFullYear()).toBe(2026);
    });
  });

  describe('cadenceToCron', () => {
    it('should repeat monthly on the renewal day', () => {
      expect(cadenceToCron('monthly', new Date(2026, 11, 1))).toBe('0 0 1 * *');
    });

    it('should use the last day for the 31st', () => {
      expect(cadenceToCron('monthly', new Date(2026, 11, 31))).toBe('0 0 L * *');
    });

    it('should repeat yearly on the renewal day and month', () => {
      expect(cadenceToCron('yearly', new Date(2026, 11, 1))).toBe('0 0 1 12 *');
    });

    it('should map 29 February to the last day of February', () => {
      expect(cadenceToCron('yearly', new Date(2028, 1, 29))).toBe('0 0 L 2 *');
    });
  });

  describe('month input helpers', () => {
    it('should round-trip YYYY-MM', () => {
      const value = toMonthInputValue(new Date(2026, 2, 14));
      expect(value).toBe('2026-03');
      expect(fromMonthInputValue(value)?.getMonth()).toBe(2);
    });

    it('should reject malformed values', () => {
      expect(fromMonthInputValue('2026-13')).toBeUndefined();
      expect(fromMonthInputValue('')).toBeUndefined();
    });
  });

  describe('usageExpenseDate', () => {
    const today = new Date(2026, 10, 12, 9);

    it('should use today for the current month', () => {
      expect(usageExpenseDate(new Date(2026, 10, 1), today)).toBe(today);
    });

    it('should use the last day of a past month', () => {
      expect(usageExpenseDate(new Date(2026, 9, 1), today).getDate()).toBe(31);
    });
  });

  describe('catalog filters', () => {
    it('should list only usage-billed services', () => {
      expect(USAGE_SERVICES.every((service) => 'usage' === service.billing)).toBe(true);
      expect(USAGE_SERVICES.map((service) => service.id)).toContain('anthropic');
    });

    it('should offer tech categories with the section as the catch-all', () => {
      expect(TECH_CATEGORY_OPTIONS).toContain('aiApis');
      expect(TECH_CATEGORY_OPTIONS).toContain('tech');
      expect(TECH_CATEGORY_OPTIONS).not.toContain('other');
    });
  });
});
