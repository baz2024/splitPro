/** Short ("Jun") and long ("June 2026") labels for a 0-based month, independent of time zone. */
export const monthLabels = (locale: string, year: number, month: number) => {
  const date = new Date(Date.UTC(year, month, 15));
  return {
    short: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date),
    long: new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date),
  };
};
