import { useState } from 'react';

/**
 * Wraps a formatted amount in Unicode left-to-right isolates so it keeps its order when it is
 * interpolated into a right-to-left sentence (the string equivalent of `dir="ltr"`).
 */
export const isolateLtr = (value: string) => `\u2066${value}\u2069`;

export const monthName = (locale: string, year: number, month: number) =>
  new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month, 1)),
  );

/** The device's `Date#getTimezoneOffset()`, read once so query keys stay stable. */
export const useTzOffset = () => useState(() => new Date().getTimezoneOffset())[0];
