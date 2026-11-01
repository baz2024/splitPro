import { gaugeValueClass } from './BudgetGauge';

describe('gaugeValueClass', () => {
  it.each([
    ['$2,000', 'text-[34px]'],
    ['$1,020.50', 'text-[28px]'],
    ['2,000 US$', 'text-[28px]'],
    ['$12,345.50', 'text-2xl'],
    ['1,020.50 US$', 'text-xl'],
  ])('should size %p with %p', (value, expected) => {
    expect(gaugeValueClass(value)).toBe(expected);
  });
});
