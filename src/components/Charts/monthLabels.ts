/**
 * Labels for a 0-based month, independent of time zone and always in Western digits: short
 * ("Jun"), short with the year ("Nov 2026") and long ("June 2026").
 */
export const monthLabels = (locale: string, year: number, month: number) => {
  const date = new Date(Date.UTC(year, month, 15));
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: 'UTC',
      numberingSystem: 'latn',
    }).format(date);
  return {
    short: format({ month: 'short' }),
    shortYear: format({ month: 'short', year: 'numeric' }),
    long: format({ month: 'long', year: 'numeric' }),
  };
};
