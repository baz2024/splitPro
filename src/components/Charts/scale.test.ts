import { getCategoryLabelKey } from '~/lib/category';

import {
  formatCompactMoney,
  formatShare,
  minorToMajor,
  niceCeil,
  stripBidiMarks,
  toLatinDigits,
  toPlotPercent,
} from './scale';

describe('minorToMajor', () => {
  it('should respect each currency precision', () => {
    expect(minorToMajor(12_345n, 'USD')).toBe(123.45);
    expect(minorToMajor(12_345n, 'JOD')).toBe(12.345);
    expect(minorToMajor(500n, 'JPY')).toBe(500);
  });
});

describe('niceCeil', () => {
  it('should round up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceCeil(0.8)).toBe(1);
    expect(niceCeil(130)).toBe(200);
    expect(niceCeil(2_100)).toBe(2_500);
    expect(niceCeil(4_000)).toBe(5_000);
    expect(niceCeil(5_000)).toBe(5_000);
    expect(niceCeil(7_200)).toBe(10_000);
  });

  it('should return 1 for zero or invalid input', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(Number.NaN)).toBe(1);
  });
});

describe('toPlotPercent', () => {
  it('should clamp to 0..100', () => {
    expect(toPlotPercent(50, 200)).toBe(25);
    expect(toPlotPercent(300, 200)).toBe(100);
    expect(toPlotPercent(-5, 200)).toBe(0);
    expect(toPlotPercent(5, 0)).toBe(0);
  });
});

describe('formatCompactMoney', () => {
  it('should format compact amounts in the currency', () => {
    expect(formatCompactMoney(123_400n, 'USD', 'en')).toBe('$1.2K');
  });

  it('should fall back to a code suffix for unknown currencies', () => {
    expect(formatCompactMoney(150_000n, 'XYZ1', 'en')).toBe('1.5K XYZ1');
  });
});

describe('formatShare', () => {
  it('should round shares and keep tiny ones above zero', () => {
    expect(formatShare(42.4, 'en')).toBe('42%');
    expect(formatShare(0.3, 'en')).toBe('<1%');
    expect(formatShare(0, 'en')).toBe('0%');
  });

  it('should drop directional marks and keep Western digits in Arabic', () => {
    expect(formatShare(0.3, 'ar')).toBe('<1%');
    expect(formatShare(42.4, 'ar')).toBe('42%');
  });
});

describe('Arabic labels', () => {
  it('should format compact money without directional marks or Arabic-Indic digits', () => {
    const label = formatCompactMoney(130_000n, 'USD', 'ar');
    expect(label).toBe(stripBidiMarks(label));
    expect(label).toMatch(/^1\.3\s/);
  });

  it('should convert Arabic-Indic and Persian digits to Western digits', () => {
    expect(toLatinDigits('٦ أشهر')).toBe('6 أشهر');
    expect(toLatinDigits('۱۲ months')).toBe('12 months');
    expect(toLatinDigits('6M')).toBe('6M');
  });

  it('should strip LRM, RLM and ALM only', () => {
    expect(stripBidiMarks('\u200f1\u200e%\u061c')).toBe('1%');
  });
});

describe('getCategoryLabelKey', () => {
  it('should map sections, items and unknown values', () => {
    expect(getCategoryLabelKey('food')).toBe('categories_list.food.items.other');
    expect(getCategoryLabelKey('groceries')).toBe('categories_list.food.items.groceries');
    expect(getCategoryLabelKey('aiApis')).toBe('categories_list.tech.items.aiApis');
    expect(getCategoryLabelKey('other')).toBeNull();
    expect(getCategoryLabelKey('nope')).toBeNull();
  });
});
