/**
 * Shared contract for the statement scan feature: a bank / card statement or a SaaS invoice
 * export goes in, a list of likely subscriptions and a "$X/yr at risk" waste report comes out.
 *
 * - `detect.ts` turns `StatementCharge[]` into a `ScanReport` (pure, no DB).
 * - `vendors.ts` turns a messy bank description into a `VendorMatch`.
 * - `invoiceExport.ts` reads SaaS invoice exports that carry billing periods.
 * - `reminderPlan.ts` decides how many days before a renewal to remind.
 * - The `statementScan` tRPC router persists items as `DetectedSubscription` rows
 *   (agent = 'statement') and turns confirmed ones into recurring expenses with reminders.
 */
import type { CalendarDate } from '../dataio/dates';

export type ScanCadence = 'weekly' | 'monthly' | 'yearly';

/** Why an item counts towards the waste headline. */
export type ScanFlag = 'trial' | 'duplicate' | 'price_rise' | 'annual_soon';

export const SCAN_FLAGS = ['trial', 'duplicate', 'price_rise', 'annual_soon'] as const;

export type ScanSource = 'statement' | 'invoice_export';

/** One outgoing charge read from the uploaded file. Amounts are positive minor units. */
export interface StatementCharge {
  /** 1-based line in the file, for evidence and debugging. */
  line: number;
  date: CalendarDate;
  description: string;
  amountMinor: bigint;
  currency: string;
  /** Invoice exports only: the billing period the charge covers. */
  periodStart?: CalendarDate;
  periodEnd?: CalendarDate;
  /** Invoice exports only: vendor known from the file itself (e.g. 'vercel'). */
  vendorHint?: string;
}

export interface VendorMatch {
  /** Stable vendor id ('raycast', 'notion', ...) or null when unknown. */
  vendorId: string | null;
  /** Display name: the real vendor, never the reseller ("Raycast", not "Paddle"). */
  name: string;
  /** Category key from src/lib/category.ts (e.g. 'software', 'ai', 'cloud'). */
  category: string;
  /** Matching id in src/lib/serviceCatalog.ts, when there is one. */
  catalogId?: string;
  /** Usual free-trial length in days, when the vendor offers one. */
  trialDays?: number;
  /** Reseller the charge came through ('paddle', 'stripe', 'google', 'apple', ...). */
  via?: string;
  /** True when the description matched a known dev / SaaS vendor pattern. */
  known: boolean;
}

export interface ScanItem {
  /**
   * Stable across rescans of overlapping statements:
   * `statement:<vendorId or normalised name>:<currency>:<cadence or 'trial'>` plus `:2`, `:3`
   * for extra parallel streams of the same vendor (duplicates).
   */
  fingerprint: string;
  vendor: VendorMatch;
  /** Up to 3 raw descriptions seen in the file, as evidence. */
  rawDescriptions: string[];
  currency: string;
  /** Null only for trials with no repeat history yet. */
  cadence: ScanCadence | null;
  /** Latest charge; for trials the expected price after the trial (0n when unknown). */
  amountMinor: bigint;
  /** Previous regular amount, set when `price_rise` is flagged. */
  previousAmountMinor: bigint | null;
  /** First charge seen: the best guess at when the subscription started. */
  firstSeen: CalendarDate;
  lastCharged: CalendarDate;
  /** Next expected charge (trial end for trials); null when it can't be worked out. */
  nextRenewal: CalendarDate | null;
  chargeCount: number;
  /** Yearly cost at the current amount (0n for trials with unknown price). */
  yearlyMinor: bigint;
  /** The part of `yearlyMinor` counted in the waste headline (see detect.ts). */
  atRiskYearlyMinor: bigint;
  flags: ScanFlag[];
  /** For a `duplicate`: fingerprint of the stream this one duplicates. */
  duplicateOf: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: ScanSource;
}

export interface ScanTotals {
  currency: string;
  yearlyMinor: bigint;
  atRiskYearlyMinor: bigint;
  subscriptions: number;
  counts: Record<ScanFlag, number>;
}

export interface ScanReport {
  source: ScanSource;
  items: ScanItem[];
  /** One entry per currency, biggest at-risk first. */
  totals: ScanTotals[];
  scannedRows: number;
  /** Rows that were income, skipped, or not part of any subscription. */
  ignoredRows: number;
  from: CalendarDate | null;
  to: CalendarDate | null;
}

export interface DetectOptions {
  /** "Today" in the user's time zone; drives annual_soon, trials and next renewals. */
  today: CalendarDate;
  source?: ScanSource;
}

/** What the user decided for one item on the confirm list. */
export type ScanDecision = 'using' | 'not_sure' | 'cancel' | 'not_subscription';

export const SCAN_DECISIONS = ['using', 'not_sure', 'cancel', 'not_subscription'] as const;

/** Days before `annual_soon` kicks in for a yearly renewal. */
export const ANNUAL_SOON_DAYS = 60;
