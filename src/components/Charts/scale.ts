import { CURRENCIES, isCurrencyCode } from '~/lib/currency';

/**
 * Minor units as a plain number in major units, for chart geometry and compact axis labels only.
 * Money arithmetic stays in BigInt; this is the last step before pixels.
 */
export const minorToMajor = (minor: bigint, currency: string): number => {
  const digits = isCurrencyCode(currency) ? CURRENCIES[currency].decimalDigits : 2;
  return Number(minor) / 10 ** digits;
};

/** Smallest "round" number (1, 2, 2.5 or 5 × 10ⁿ) at or above `value`, for a clean axis top. */
export const niceCeil = (value: number): number => {
  if (!Number.isFinite(value) || 0 >= value) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => fraction <= candidate + 1e-9) ?? 10;
  return step * magnitude;
};

/** Share of `value` in `max` as a 0–100 percentage of the plot, clamped. */
export const toPlotPercent = (value: number, max: number): number => {
  if (0 >= max || 0 >= value) {
    return 0;
  }
  return Math.min(100, (value / max) * 100);
};

/**
 * Compact currency label for a value in major units ("$1.2K"). Falls back to a compact plain
 * number with the code when the runtime does not know the currency.
 */
export const formatCompactMajor = (value: number, currency: string, locale: string): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    const number = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
    return `${number} ${currency}`;
  }
};

/** Compact currency label for an amount in minor units, for bar caps and axis ticks. */
export const formatCompactMoney = (minor: bigint, currency: string, locale: string): string =>
  formatCompactMajor(minorToMajor(minor, currency), currency, locale);

/** Whole-number share for labels: "<1%" for tiny non-zero shares so they never read as zero. */
export const formatShare = (percent: number, locale: string): string => {
  if (0 < percent && 1 > percent) {
    return `<${new Intl.NumberFormat(locale, { style: 'percent' }).format(0.01)}`;
  }
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    percent / 100,
  );
};
