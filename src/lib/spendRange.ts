/** The chart ranges offered on the project page. */
export const SPEND_RANGES = ['1m', '6m', '1y'] as const;
export type SpendRange = (typeof SPEND_RANGES)[number];

/** How many bars each range draws: 30 daily bars, or 6 / 12 monthly bars. */
export const RANGE_PERIODS = { '1m': 30, '6m': 6, '1y': 12 } as const satisfies Record<
  SpendRange,
  number
>;
