/**
 * Find likely subscriptions in a list of outgoing charges and price the waste headline.
 *
 * 1. Charges are grouped by vendor (id, else normalised merchant) and currency.
 * 2. A group becomes one or more streams: a clean series with a weekly / monthly / yearly
 *    rhythm, or, when charges are too close together, amount clusters (two cards, two plans)
 *    and same-amount series split by billing day. Parallel streams are `duplicate`s.
 * 3. Unknown merchants (groceries, taxis, restaurants) need a stable amount, a regular rhythm
 *    and must make up most of that merchant's charges, so ordinary spending never shows up.
 * 4. Invoice exports carry billing periods, which give the cadence directly.
 *
 * At-risk money per item (never double counted): the whole yearly cost for a duplicate, an
 * annual renewal within ANNUAL_SOON_DAYS or a trial about to convert; the yearly cost of the
 * increase for a price rise; nothing otherwise.
 */
import { type CalendarDate } from '../dataio/dates';
import { currencyDigits } from '../dataio/decimal';

import {
  ANNUAL_SOON_DAYS,
  type DetectOptions,
  SCAN_FLAGS,
  type ScanCadence,
  type ScanFlag,
  type ScanItem,
  type ScanReport,
  type ScanSource,
  type ScanTotals,
  type StatementCharge,
  type VendorMatch,
} from './types';
import {
  UNKNOWN_VENDOR_CATEGORY,
  isNonSubscriptionMerchant,
  matchVendor,
  normaliseMerchant,
  vendorKey,
  vendorMonthlyUsd,
} from './vendors';

const DAY_MS = 86_400_000;
/** A trial card check must have happened this recently to be reported. */
const TRIAL_LOOKBACK_DAYS = 45;
/** Amount band (±) for a stream; outside it, a separate stream or a price change. */
const STREAM_BAND_PERCENT = 15n;
/** Amounts within this band count as "the same price" when looking for price steps. */
const PRICE_STEP_BAND_PERCENT = 2n;
/** A price rise must be bigger than this. */
const PRICE_RISE_PERCENT = 5n;
/** Unknown merchants must be this stable (or show one clean price step). */
const UNKNOWN_BAND_PERCENT = 5n;

interface CadenceRule {
  days: number;
  /** Median gap range that identifies the cadence. */
  core: readonly [number, number];
  /** Gaps accepted inside a stream: one cycle, or two (one missed charge). */
  oneCycle: readonly [number, number];
  twoCycles: readonly [number, number] | null;
  perYear: bigint;
  /** Period lengths (days) that identify the cadence on invoices. */
  period: readonly [number, number];
}

const CADENCES: Record<ScanCadence, CadenceRule> = {
  weekly: {
    days: 7,
    core: [6, 8],
    oneCycle: [5, 9],
    twoCycles: [12, 16],
    perYear: 52n,
    period: [5, 9],
  },
  monthly: {
    days: 30,
    core: [26, 35],
    oneCycle: [24, 38],
    twoCycles: [52, 70],
    perYear: 12n,
    period: [26, 35],
  },
  yearly: {
    days: 365,
    core: [350, 380],
    oneCycle: [340, 390],
    twoCycles: null,
    perYear: 1n,
    period: [350, 380],
  },
};

const CADENCE_ORDER = ['weekly', 'monthly', 'yearly'] as const satisfies readonly ScanCadence[];

/** Currencies close enough to USD to compare against USD list prices. */
const USD_LIKE = new Set(['USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'SGD']);

// ---------------------------------------------------------------------------------------------
// Calendar helpers

const dayNumber = ({ year, month, day }: CalendarDate) =>
  Math.round(Date.UTC(year, month - 1, day) / DAY_MS);

const fromDayNumber = (value: number): CalendarDate => {
  const date = new Date(value * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const addMonths = (date: CalendarDate, months: number): CalendarDate => {
  const total = date.year * 12 + date.month - 1 + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
};

/** `steps` cycles after `date`, keeping the billing day of month. */
const advance = (date: CalendarDate, cadence: ScanCadence, steps: number): CalendarDate => {
  if ('weekly' === cadence) {
    return fromDayNumber(dayNumber(date) + 7 * steps);
  }
  return addMonths(date, ('monthly' === cadence ? 1 : 12) * steps);
};

/** First renewal on or after `today` (at least one cycle after `from`). */
const rollForward = (
  from: CalendarDate,
  cadence: ScanCadence,
  today: CalendarDate,
  minSteps = 1,
): CalendarDate => {
  const target = dayNumber(today);
  const findStep = (steps: number): CalendarDate => {
    const next = advance(from, cadence, steps);
    return dayNumber(next) >= target || 5000 < steps ? next : findStep(steps + 1);
  };
  return findStep(minSteps);
};

const inRange = (value: number, [min, max]: readonly [number, number]) =>
  min <= value && value <= max;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return 0 === sorted.length % 2
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
};

const medianAmount = (values: readonly bigint[]): bigint => {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0n;
};

/** `a` within ±percent of `b`. */
const withinBand = (a: bigint, b: bigint, percent: bigint) => {
  const diff = a > b ? a - b : b - a;
  return diff * 100n <= b * percent;
};

// ---------------------------------------------------------------------------------------------
// Streams

interface Dated extends StatementCharge {
  day: number;
}

interface Stream {
  cadence: ScanCadence;
  charges: Dated[];
  /** Gaps where one charge was missed. */
  skips: number;
  /** Single charge read as a yearly plan from its size. */
  inferredYearly?: 'medium' | 'low';
}

const byDay = (charges: readonly Dated[]) =>
  [...charges].sort((a, b) => a.day - b.day || a.line - b.line);

const gapsOf = (charges: readonly Dated[]) =>
  charges.slice(1).map((charge, index) => charge.day - (charges[index]?.day ?? charge.day));

const isAllowedGap = (gap: number, rule: CadenceRule) =>
  inRange(gap, rule.oneCycle) || (null !== rule.twoCycles && inRange(gap, rule.twoCycles));

/**
 * Read a date-sorted series as one stream: the median gap picks the cadence, no gap may be
 * shorter than a cycle, and a long or irregular gap starts over (the latest run wins).
 */
const evaluateSeries = (sorted: readonly Dated[]): Stream | null => {
  if (2 > sorted.length) {
    return null;
  }
  const gaps = gapsOf(sorted);
  const middle = median(gaps);
  const cadence = CADENCE_ORDER.find((entry) => inRange(middle, CADENCES[entry].core));
  if (!cadence) {
    return null;
  }
  const rule = CADENCES[cadence];
  if (gaps.some((gap) => gap < rule.oneCycle[0])) {
    return null;
  }
  const lastBreak = gaps.reduce(
    (found, gap, index) => (isAllowedGap(gap, rule) ? found : index),
    -1,
  );
  const charges = sorted.slice(lastBreak + 1);
  if (2 > charges.length) {
    return null;
  }
  const skips = gaps.slice(lastBreak + 1).filter((gap) => !inRange(gap, rule.oneCycle)).length;
  return { cadence, charges, skips };
};

/** Group charges whose amounts sit within the stream band of the cluster's smallest one. */
const clusterByAmount = (charges: readonly Dated[]): Dated[][] =>
  [...charges]
    .sort((a, b) => (a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0))
    .reduce<Dated[][]>((clusters, charge) => {
      const current = clusters.at(-1);
      const floor = current?.[0]?.amountMinor;
      if (
        current &&
        undefined !== floor &&
        charge.amountMinor * 100n <= floor * (100n + STREAM_BAND_PERCENT)
      ) {
        current.push(charge);
        return clusters;
      }
      clusters.push([charge]);
      return clusters;
    }, []);

/** Distance in days from a whole number of months (one or two). */
const monthOffset = (gap: number) => Math.min(Math.abs(gap - 30.44), Math.abs(gap - 60.88));

/**
 * Same-amount charges more than once a month (two cards, two seats): chain each charge to the
 * series whose last charge is about a month earlier.
 */
const splitByBillingDay = (sorted: readonly Dated[]): Stream[] => {
  const rule = CADENCES.monthly;
  const chains = sorted.reduce<Dated[][]>((acc, charge) => {
    const fit = acc
      .map((chain) => ({ chain, gap: charge.day - (chain.at(-1)?.day ?? charge.day) }))
      .filter(({ gap }) => isAllowedGap(gap, rule))
      .sort((a, b) => monthOffset(a.gap) - monthOffset(b.gap))
      .at(0);
    if (fit) {
      fit.chain.push(charge);
      return acc;
    }
    acc.push([charge]);
    return acc;
  }, []);
  const streams = chains.flatMap((chain) => {
    const stream = evaluateSeries(chain);
    return stream && 'monthly' === stream.cadence ? [stream] : [];
  });
  const covered = streams.reduce((sum, stream) => sum + stream.charges.length, 0);
  // Only trust the split when it explains (nearly) every charge.
  return covered * 10 >= sorted.length * 8 ? streams : [];
};

const overlaps = (a: Stream, b: Stream) => {
  const aFirst = a.charges[0]?.day ?? 0;
  const aLast = a.charges.at(-1)?.day ?? 0;
  const bFirst = b.charges[0]?.day ?? 0;
  const bLast = b.charges.at(-1)?.day ?? 0;
  return aFirst <= bLast && bFirst <= aLast;
};

/** Join streams that follow each other in time (a price change bigger than the band). */
const mergeSequential = (streams: readonly Stream[]): Stream[] =>
  [...streams]
    .sort((a, b) => (a.charges[0]?.day ?? 0) - (b.charges[0]?.day ?? 0))
    .reduce<Stream[]>((acc, stream) => {
      const previous = acc.find(
        (candidate) => candidate.cadence === stream.cadence && !overlaps(candidate, stream),
      );
      const merged = previous
        ? evaluateSeries(byDay([...previous.charges, ...stream.charges]))
        : null;
      if (
        previous &&
        merged &&
        merged.charges.length === previous.charges.length + stream.charges.length
      ) {
        acc.splice(acc.indexOf(previous), 1, merged);
        return acc;
      }
      acc.push(stream);
      return acc;
    }, []);

const isProbe = (charge: StatementCharge) =>
  charge.amountMinor <= 10n ** BigInt(currencyDigits(charge.currency));

/**
 * Charges to read as streams. Tiny charges are card checks, unless they repeat on a rhythm:
 * then they are a cheap plan (iCloud at 0.99 a month), not a trial.
 */
const regularCharges = (charges: readonly Dated[]): Dated[] => {
  const tiny = charges.filter((charge) => isProbe(charge) && 0n < charge.amountMinor);
  const repeats = null !== evaluateSeries(byDay(tiny));
  return charges.filter((charge) => (repeats ? 0n < charge.amountMinor : !isProbe(charge)));
};

const findStreams = (charges: readonly Dated[], known: boolean): Stream[] => {
  const sorted = byDay(charges);
  const whole = evaluateSeries(sorted);
  if (whole) {
    return [whole];
  }
  const streams = clusterByAmount(sorted).flatMap((cluster) => {
    const series = byDay(cluster);
    const stream = evaluateSeries(series);
    if (stream) {
      return [stream];
    }
    return known && 4 <= series.length ? splitByBillingDay(series) : [];
  });
  return mergeSequential(streams);
};

/** A known vendor's lone charge worth many months of its list price reads as a yearly plan. */
const inferYearly = (charges: readonly Dated[], vendor: VendorMatch): Stream | null => {
  const monthly = vendorMonthlyUsd(vendor.vendorId);
  const [only] = charges;
  if (!vendor.known || null === monthly || 0n === monthly || 1 !== charges.length || !only) {
    return null;
  }
  if (!USD_LIKE.has(only.currency) || 2 !== currencyDigits(only.currency)) {
    return null;
  }
  if (only.amountMinor >= monthly * 10n) {
    return { cadence: 'yearly', charges: [only], skips: 0, inferredYearly: 'medium' };
  }
  if (only.amountMinor >= monthly * 8n) {
    return { cadence: 'yearly', charges: [only], skips: 0, inferredYearly: 'low' };
  }
  return null;
};

// ---------------------------------------------------------------------------------------------
// Amount analysis

/** Consecutive runs of (nearly) the same price. */
const priceSegments = (charges: readonly Dated[]): Dated[][] =>
  charges.reduce<Dated[][]>((segments, charge) => {
    const current = segments.at(-1);
    const anchor = current?.[0]?.amountMinor;
    if (
      current &&
      undefined !== anchor &&
      withinBand(charge.amountMinor, anchor, PRICE_STEP_BAND_PERCENT)
    ) {
      current.push(charge);
      return segments;
    }
    segments.push([charge]);
    return segments;
  }, []);

/** Previous regular price when the latest price is more than 5% higher. */
const previousPrice = (charges: readonly Dated[]): bigint | null => {
  const segments = priceSegments(charges);
  if (2 > segments.length || 3 < segments.length) {
    return null;
  }
  const latest = segments.at(-1)?.[0]?.amountMinor;
  const before = segments.at(-2)?.at(-1)?.amountMinor;
  if (undefined === latest || undefined === before) {
    return null;
  }
  return latest * 100n > before * (100n + PRICE_RISE_PERCENT) ? before : null;
};

const isStable = (charges: readonly Dated[], percent: bigint) => {
  const middle = medianAmount(charges.map((charge) => charge.amountMinor));
  return charges.every((charge) => withinBand(charge.amountMinor, middle, percent));
};

/**
 * Unknown merchants: one price throughout, or one clean price step with at least two charges
 * on each side. Short series must be tighter, since a few restaurant bills can look alike.
 */
const isSteadyForUnknown = (charges: readonly Dated[]) => {
  if (4 > charges.length) {
    return isStable(charges, PRICE_STEP_BAND_PERCENT);
  }
  if (isStable(charges, UNKNOWN_BAND_PERCENT)) {
    return true;
  }
  const segments = priceSegments(charges);
  return 2 === segments.length && segments.every((segment) => 2 <= segment.length);
};

const acceptUnknown = (stream: Stream, groupSize: number) => {
  const { charges } = stream;
  const [first] = charges;
  if (!first || charges.some((charge) => isNonSubscriptionMerchant(charge.description))) {
    return false;
  }
  // The stream must be most of what this merchant charged (a supermarket never is).
  if (charges.length * 2 < groupSize || !isSteadyForUnknown(charges)) {
    return false;
  }
  if (3 <= charges.length) {
    return true;
  }
  const sameAmount = charges.every((charge) => charge.amountMinor === first.amountMinor);
  return sameAmount && 0 === stream.skips && 'weekly' !== stream.cadence;
};

const confidenceOf = (stream: Stream, known: boolean): ScanItem['confidence'] => {
  if (stream.inferredYearly) {
    return stream.inferredYearly;
  }
  const { charges } = stream;
  if (!known) {
    const [first] = charges;
    const exact = charges.every((charge) => charge.amountMinor === first?.amountMinor);
    return 4 <= charges.length && exact && 0 === stream.skips ? 'medium' : 'low';
  }
  if (3 <= charges.length && isStable(charges, STREAM_BAND_PERCENT) && 1 >= stream.skips) {
    return 'high';
  }
  return 'medium';
};

// ---------------------------------------------------------------------------------------------
// Items

interface Group {
  key: string;
  vendor: VendorMatch;
  currency: string;
  charges: Dated[];
}

interface Draft {
  item: ScanItem;
  used: readonly StatementCharge[];
}

const UNKNOWN_VENDOR: VendorMatch = {
  vendorId: null,
  name: 'Unknown vendor',
  category: UNKNOWN_VENDOR_CATEGORY,
  known: false,
};

const rawDescriptions = (charges: readonly StatementCharge[]) =>
  [...new Set([...charges].reverse().map((charge) => charge.description))].slice(0, 3);

const yearlyOf = (amount: bigint, cadence: ScanCadence) => amount * CADENCES[cadence].perYear;

const atRiskOf = (
  flags: readonly ScanFlag[],
  yearly: bigint,
  amount: bigint,
  previous: bigint | null,
  cadence: ScanCadence | null,
) => {
  if (flags.includes('duplicate') || flags.includes('annual_soon') || flags.includes('trial')) {
    return yearly;
  }
  if (flags.includes('price_rise') && null !== previous && null !== cadence) {
    return (amount - previous) * CADENCES[cadence].perYear;
  }
  return 0n;
};

const isAnnualSoon = (cadence: ScanCadence, next: CalendarDate, today: CalendarDate) => {
  const days = dayNumber(next) - dayNumber(today);
  return 'yearly' === cadence && 0 <= days && days <= ANNUAL_SOON_DAYS;
};

interface StreamItemInput {
  group: Group;
  stream: Stream;
  fingerprint: string;
  duplicateOf: string | null;
  today: CalendarDate;
  source: ScanSource;
  firstSeen?: CalendarDate;
  nextRenewal?: CalendarDate;
  confidence?: ScanItem['confidence'];
}

const streamItem = ({
  group,
  stream,
  fingerprint,
  duplicateOf,
  today,
  source,
  firstSeen,
  nextRenewal,
  confidence,
}: StreamItemInput): ScanItem | null => {
  const first = stream.charges[0];
  const latest = stream.charges.at(-1);
  if (!first || !latest) {
    return null;
  }
  const { cadence } = stream;
  const amountMinor = latest.amountMinor;
  const previous = previousPrice(stream.charges);
  const next = nextRenewal ?? rollForward(latest.date, cadence, today);
  const flags = SCAN_FLAGS.filter(
    (flag) =>
      ('duplicate' === flag && null !== duplicateOf) ||
      ('price_rise' === flag && null !== previous) ||
      ('annual_soon' === flag && isAnnualSoon(cadence, next, today)),
  );
  const yearlyMinor = yearlyOf(amountMinor, cadence);
  return {
    fingerprint,
    vendor: group.vendor,
    rawDescriptions: rawDescriptions(stream.charges),
    currency: group.currency,
    cadence,
    amountMinor,
    previousAmountMinor: previous,
    firstSeen: firstSeen ?? first.date,
    lastCharged: latest.date,
    nextRenewal: next,
    chargeCount: stream.charges.length,
    yearlyMinor,
    atRiskYearlyMinor: atRiskOf(flags, yearlyMinor, amountMinor, previous, cadence),
    flags,
    duplicateOf,
    confidence: confidence ?? confidenceOf(stream, group.vendor.known),
    source,
  };
};

const baseFingerprint = (group: Group, cadence: ScanCadence | 'trial') =>
  `statement:${group.key}:${group.currency}:${cadence}`;

const isStale = (stream: Stream, toDay: number) => {
  const last = stream.charges.at(-1)?.day ?? 0;
  const rule = CADENCES[stream.cadence];
  // Two missed cycles (a missed yearly renewal) mean the subscription most likely stopped.
  const allowance = 'yearly' === stream.cadence ? rule.days + 30 : 2 * rule.days + 5;
  return toDay - last > allowance;
};

const rankStreams = (streams: readonly Stream[]) =>
  [...streams].sort((a, b) => {
    const count = b.charges.length - a.charges.length;
    const firstDay = (a.charges[0]?.day ?? 0) - (b.charges[0]?.day ?? 0);
    const amountA = a.charges.at(-1)?.amountMinor ?? 0n;
    const amountB = b.charges.at(-1)?.amountMinor ?? 0n;
    return count || firstDay || (amountA > amountB ? -1 : amountA < amountB ? 1 : 0);
  });

const trialItem = (group: Group, live: boolean, today: CalendarDate): Draft | null => {
  const { vendor } = group;
  const trialDays = vendor.trialDays;
  if (live || !vendor.known || undefined === trialDays) {
    return null;
  }
  const todayDay = dayNumber(today);
  const probe = byDay(group.charges.filter(isProbe)).at(-1);
  if (!probe || todayDay - probe.day > TRIAL_LOOKBACK_DAYS || probe.day > todayDay) {
    return null;
  }
  // Any paid charge means this is an existing customer or a trial that already converted.
  const hasPaid = group.charges.some((charge) => !isProbe(charge));
  const trialEnd = probe.day + trialDays;
  if (hasPaid || trialEnd < todayDay) {
    return null;
  }
  const amountMinor = 'USD' === group.currency ? (vendorMonthlyUsd(vendor.vendorId) ?? 0n) : 0n;
  const yearlyMinor = yearlyOf(amountMinor, 'monthly');
  return {
    item: {
      fingerprint: baseFingerprint(group, 'trial'),
      vendor,
      rawDescriptions: [probe.description],
      currency: group.currency,
      cadence: null,
      amountMinor,
      previousAmountMinor: null,
      firstSeen: probe.date,
      lastCharged: probe.date,
      nextRenewal: fromDayNumber(trialEnd),
      chargeCount: 1,
      yearlyMinor,
      atRiskYearlyMinor: yearlyMinor,
      flags: ['trial'],
      duplicateOf: null,
      confidence: 0n === probe.amountMinor ? 'high' : 'medium',
      source: 'statement',
    },
    used: [probe],
  };
};

const statementDrafts = (group: Group, today: CalendarDate, toDay: number): Draft[] => {
  // An invoice list without billing periods still names real bills, not everyday spending.
  const fromInvoices = group.charges.some((charge) => undefined !== charge.vendorHint);
  const regular = regularCharges(group.charges);
  const found = findStreams(regular, group.vendor.known);
  const streams =
    0 < found.length ? found : [inferYearly(regular, group.vendor)].filter((s) => null !== s);
  const live = rankStreams(
    streams
      .filter((stream) => !isStale(stream, toDay))
      .filter(
        (stream) => group.vendor.known || fromInvoices || acceptUnknown(stream, regular.length),
      ),
  );
  const mains = new Map<ScanCadence, { stream: Stream; fingerprint: string; extra: number }>();
  const drafts = live.flatMap((stream): Draft[] => {
    const main = mains.get(stream.cadence);
    const extra = main ? main.extra + 1 : 1;
    const fingerprint = main
      ? `${baseFingerprint(group, stream.cadence)}:${extra}`
      : baseFingerprint(group, stream.cadence);
    if (main) {
      main.extra = extra;
    } else {
      mains.set(stream.cadence, { stream, fingerprint, extra: 1 });
    }
    const duplicateOf = main && overlaps(main.stream, stream) ? main.fingerprint : null;
    const item = streamItem({
      group,
      stream,
      fingerprint,
      duplicateOf,
      today,
      source: fromInvoices ? 'invoice_export' : 'statement',
    });
    return item ? [{ item, used: stream.charges }] : [];
  });
  const trial = trialItem(group, 0 < live.length, today);
  return trial ? [...drafts, trial] : drafts;
};

// ---------------------------------------------------------------------------------------------
// Invoice exports

const periodLength = (charge: StatementCharge) =>
  charge.periodStart && charge.periodEnd
    ? dayNumber(charge.periodEnd) - dayNumber(charge.periodStart)
    : -1;

const periodCadence = (charge: StatementCharge): ScanCadence | null =>
  CADENCE_ORDER.find((cadence) => inRange(periodLength(charge), CADENCES[cadence].period)) ?? null;

/** One bill per billing period: line items of the same period are added up. */
const mergePeriods = (charges: readonly Dated[]): Dated[] => [
  ...charges
    .reduce((acc, charge) => {
      const key = `${dayNumber(charge.periodStart ?? charge.date)}|${dayNumber(charge.periodEnd ?? charge.date)}`;
      const previous = acc.get(key);
      acc.set(
        key,
        previous
          ? {
              ...previous,
              amountMinor: previous.amountMinor + charge.amountMinor,
              day: Math.max(previous.day, charge.day),
              date: previous.day >= charge.day ? previous.date : charge.date,
            }
          : charge,
      );
      return acc;
    }, new Map<string, Dated>())
    .values(),
];

const invoiceDrafts = (group: Group, today: CalendarDate, toDay: number): Draft[] =>
  CADENCE_ORDER.flatMap((cadence): Draft[] => {
    const charges = group.charges.filter((charge) => cadence === periodCadence(charge));
    if (0 === charges.length) {
      return [];
    }
    const rule = CADENCES[cadence];
    const bills = mergePeriods(charges).sort(
      (a, b) => dayNumber(a.periodStart ?? a.date) - dayNumber(b.periodStart ?? b.date),
    );
    const starts = bills.map((bill) => dayNumber(bill.periodStart ?? bill.date));
    // A long pause between billing periods: keep the latest run.
    const lastBreak = starts.reduce(
      (found, start, index) =>
        0 < index && start - (starts[index - 1] ?? start) > (rule.twoCycles ?? rule.oneCycle)[1]
          ? index
          : found,
      0,
    );
    const run = bills.slice(lastBreak);
    const [firstBill] = run;
    const lastEnd = Math.max(...run.map((bill) => dayNumber(bill.periodEnd ?? bill.date)));
    const allowance = 'yearly' === cadence ? 30 : rule.days + 5;
    if (!firstBill || toDay - lastEnd > allowance) {
      return [];
    }
    const endDate = fromDayNumber(lastEnd);
    const next =
      dayNumber(endDate) >= dayNumber(today) ? endDate : rollForward(endDate, cadence, today, 0);
    const stream: Stream = { cadence, charges: byDay(run), skips: 0 };
    const item = streamItem({
      group,
      stream,
      fingerprint: baseFingerprint(group, cadence),
      duplicateOf: null,
      today,
      source: 'invoice_export',
      firstSeen: firstBill.periodStart ?? firstBill.date,
      nextRenewal: next,
      confidence: 2 <= run.length ? 'high' : 'medium',
    });
    const runStart = dayNumber(firstBill.periodStart ?? firstBill.date);
    const used = charges.filter(
      (charge) => dayNumber(charge.periodStart ?? charge.date) >= runStart,
    );
    return item ? [{ item, used }] : [];
  });

// ---------------------------------------------------------------------------------------------
// Report

const resolveVendor = (charge: StatementCharge, cache: Map<string, VendorMatch>): VendorMatch => {
  const cacheKey = `${charge.description}\u0000${charge.vendorHint ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const byDescription = matchVendor(charge.description);
  const hint = charge.vendorHint;
  const resolved =
    byDescription.known || undefined === hint
      ? byDescription
      : 'unknown' === hint.toLowerCase()
        ? '' === normaliseMerchant(charge.description)
          ? UNKNOWN_VENDOR
          : byDescription
        : matchVendor(hint);
  cache.set(cacheKey, resolved);
  return resolved;
};

const groupCharges = (charges: readonly StatementCharge[]): Group[] => {
  const cache = new Map<string, VendorMatch>();
  const dated = byDay(charges.map((charge) => ({ ...charge, day: dayNumber(charge.date) })));
  const groups = dated.reduce((acc, charge) => {
    const vendor = resolveVendor(charge, cache);
    const key = vendorKey(vendor);
    const id = `${key}|${charge.currency}`;
    const group = acc.get(id) ?? { key, vendor, currency: charge.currency, charges: [] };
    // Oldest first, so the latest charge decides the reseller shown ("via").
    group.vendor = vendor;
    group.charges.push(charge);
    acc.set(id, group);
    return acc;
  }, new Map<string, Group>());
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
};

const FLAG_PRIORITY: readonly ScanFlag[] = ['trial', 'annual_soon', 'duplicate', 'price_rise'];

const flagRank = (item: ScanItem) => {
  const rank = FLAG_PRIORITY.findIndex((flag) => item.flags.includes(flag));
  return -1 === rank ? FLAG_PRIORITY.length : rank;
};

const compareItems = (a: ScanItem, b: ScanItem) => {
  const rank = flagRank(a) - flagRank(b);
  if (0 !== rank) {
    return rank;
  }
  if (2 > flagRank(a) && a.nextRenewal && b.nextRenewal) {
    const soon = dayNumber(a.nextRenewal) - dayNumber(b.nextRenewal);
    if (0 !== soon) {
      return soon;
    }
  }
  if (a.yearlyMinor !== b.yearlyMinor) {
    return a.yearlyMinor > b.yearlyMinor ? -1 : 1;
  }
  return a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0;
};

const emptyCounts = (): Record<ScanFlag, number> => ({
  trial: 0,
  duplicate: 0,
  price_rise: 0,
  annual_soon: 0,
});

const totalsOf = (items: readonly ScanItem[]): ScanTotals[] =>
  [
    ...items
      .reduce((acc, item) => {
        const total = acc.get(item.currency) ?? {
          currency: item.currency,
          yearlyMinor: 0n,
          atRiskYearlyMinor: 0n,
          subscriptions: 0,
          counts: emptyCounts(),
        };
        total.yearlyMinor += item.yearlyMinor;
        total.atRiskYearlyMinor += item.atRiskYearlyMinor;
        total.subscriptions += 1;
        item.flags.forEach((flag) => {
          total.counts[flag] += 1;
        });
        acc.set(item.currency, total);
        return acc;
      }, new Map<string, ScanTotals>())
      .values(),
  ].sort((a, b) => {
    if (a.atRiskYearlyMinor !== b.atRiskYearlyMinor) {
      return a.atRiskYearlyMinor > b.atRiskYearlyMinor ? -1 : 1;
    }
    if (a.yearlyMinor !== b.yearlyMinor) {
      return a.yearlyMinor > b.yearlyMinor ? -1 : 1;
    }
    return a.currency < b.currency ? -1 : 1;
  });

const hasPeriod = (charge: StatementCharge) =>
  undefined !== charge.periodStart && undefined !== charge.periodEnd;

/** Turn outgoing charges into the subscription list and waste totals (pure, deterministic). */
export const detectSubscriptions = (
  charges: readonly StatementCharge[],
  options: DetectOptions,
): ScanReport => {
  const { today } = options;
  const source: ScanSource =
    options.source ?? (charges.some(hasPeriod) ? 'invoice_export' : 'statement');
  const days = charges.map((charge) => dayNumber(charge.date));
  const fromDay = 0 < days.length ? Math.min(...days) : null;
  const toDay = 0 < days.length ? Math.max(...days) : null;
  if (null === fromDay || null === toDay) {
    return { source, items: [], totals: [], scannedRows: 0, ignoredRows: 0, from: null, to: null };
  }
  const drafts = groupCharges(charges).flatMap((group) => {
    const periodic = group.charges.filter((charge) => null !== periodCadence(charge));
    const plain = group.charges.filter((charge) => null === periodCadence(charge));
    const fromInvoices =
      0 < periodic.length ? invoiceDrafts({ ...group, charges: periodic }, today, toDay) : [];
    const fromStatement =
      0 < plain.length ? statementDrafts({ ...group, charges: plain }, today, toDay) : [];
    return fromInvoices.concat(fromStatement);
  });
  const usedLines = new Set(drafts.flatMap((draft) => draft.used.map((charge) => charge.line)));
  const items = drafts.map((draft) => draft.item).sort(compareItems);
  return {
    source,
    items,
    totals: totalsOf(items),
    scannedRows: charges.length,
    ignoredRows: charges.filter((charge) => !usedLines.has(charge.line)).length,
    from: fromDayNumber(fromDay),
    to: fromDayNumber(toDay),
  };
};
