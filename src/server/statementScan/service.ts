import { randomBytes } from 'node:crypto';

import {
  type DetectedSubscription,
  type Prisma,
  type PrismaClient,
  SplitType,
} from '@prisma/client';
import { TRPCError } from '@trpc/server';

import { createExpense } from '~/server/api/services/splitService';
import { mergeEvidence } from '~/server/agent/validation';

import { detectFormat } from '../dataio/columns';
import {
  type CalendarDate,
  calendarDateInZone,
  calendarDateToUtcMidnight,
  calendarDateToUtcNoon,
} from '../dataio/dates';
import { type UploadInspection, columnsGuessFrom } from '../dataio/inspect';
import { type ParsedTable, normaliseRows } from '../dataio/normalise';
import { loadUpload } from '../dataio/service';
import {
  type AmountSign,
  type DateFormat,
  type ImportMapping,
  REQUIRED_IMPORT_FIELDS,
} from '../dataio/types';
import { importRowsToCharges } from './charges';
import { cadenceCron, previousCycleDate } from './cron';
import { detectSubscriptions } from './detect';
import { detectInvoiceExport, invoiceRowsToCharges } from './invoiceExport';
import { reminderDaysFor } from './reminderPlan';
import { prepareStatementTable, statementTableProblem } from './statementColumns';
import {
  SCAN_FLAGS,
  type ScanCadence,
  type ScanDecision,
  type ScanFlag,
  type ScanItem,
  type ScanReport,
  type ScanSource,
  type ScanTotals,
  type VendorMatch,
} from './types';

export const STATEMENT_AGENT = 'statement';
export const MAX_SCAN_DECISIONS = 200;
export const PLANNED_TO_CANCEL_REASON = 'note:Planned to cancel';

interface UploadFile {
  name: string;
  gzipBase64: string;
}
type RowStatus = DetectedSubscription['status'];

export type StoredScanItem = ScanItem & { id: string; status: RowStatus };

export interface ScanOptions {
  mapping: ImportMapping;
  dateFormat: DateFormat;
  defaultCurrency: string;
  amountSign: AmountSign;
  timeZone: string;
}

export interface ConfirmDecision {
  id: string;
  decision: ScanDecision;
  amountMinor?: bigint;
  cadence?: ScanCadence;
  name?: string;
  nextRenewal?: CalendarDate;
}

export type ConfirmErrorCode = 'amount_required' | 'not_found' | 'failed';

export interface ConfirmResult {
  created: { id: string; expenseId: string; remindDaysBefore: number | null }[];
  dismissed: number;
  errors: { id: string; code: ConfirmErrorCode }[];
}

const CADENCES = ['weekly', 'monthly', 'yearly'] as const satisfies readonly ScanCadence[];
const CONFIDENCES = ['high', 'medium', 'low'] as const;

// ---------------------------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------------------------

/**
 * Time-ordered cuid-style id ('c' + base36 timestamp + random), so the newest scan sorts last
 * and `latest` can find it without a separate scans table.
 */
export const newScanId = (now = Date.now()): string =>
  `c${now.toString(36).padStart(9, '0')}${randomBytes(12).toString('hex').slice(0, 15)}`;

const toCalendarDate = (date: Date): CalendarDate => ({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
});

const fromCalendarDate = (date: CalendarDate | null) =>
  null === date ? null : calendarDateToUtcNoon(date);

const isCadence = (value: string | null): value is ScanCadence =>
  null !== value && (CADENCES as readonly string[]).includes(value);

const isFlag = (value: string): value is ScanFlag =>
  (SCAN_FLAGS as readonly string[]).includes(value);

const isConfidence = (value: string | null): value is ScanItem['confidence'] =>
  null !== value && (CONFIDENCES as readonly string[]).includes(value);

const addCadence = ({ year, month, day }: CalendarDate, cadence: ScanCadence): CalendarDate => {
  if ('weekly' === cadence) {
    return toCalendarDate(new Date(Date.UTC(year, month - 1, day + 7)));
  }
  const months = 'yearly' === cadence ? 12 : 1;
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return toCalendarDate(new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))));
};

const isAfter = (a: CalendarDate, b: CalendarDate) =>
  calendarDateToUtcMidnight(a).getTime() > calendarDateToUtcMidnight(b).getTime();

/** First renewal strictly after `today`, stepping from the last charge (or today). */
export const nextRenewalAfter = (
  lastCharged: CalendarDate | null,
  cadence: ScanCadence,
  today: CalendarDate,
): CalendarDate => {
  const step = (date: CalendarDate, guard: number): CalendarDate =>
    isAfter(date, today) || 0 >= guard ? date : step(addCadence(date, cadence), guard - 1);
  return step(addCadence(lastCharged ?? today, cadence), 2000);
};

const emptyCounts = (): Record<ScanFlag, number> => ({
  trial: 0,
  duplicate: 0,
  price_rise: 0,
  annual_soon: 0,
});

/** Per-currency totals, biggest at-risk first (same shape as `ScanReport.totals`). */
export const totalsFor = (items: readonly ScanItem[]): ScanTotals[] => {
  const byCurrency = items.reduce<Map<string, ScanTotals>>((acc, item) => {
    const current = acc.get(item.currency) ?? {
      currency: item.currency,
      yearlyMinor: 0n,
      atRiskYearlyMinor: 0n,
      subscriptions: 0,
      counts: emptyCounts(),
    };
    item.flags.forEach((flag) => {
      current.counts[flag] += 1;
    });
    acc.set(item.currency, {
      ...current,
      yearlyMinor: current.yearlyMinor + item.yearlyMinor,
      atRiskYearlyMinor: current.atRiskYearlyMinor + item.atRiskYearlyMinor,
      subscriptions: current.subscriptions + 1,
    });
    return acc;
  }, new Map());
  return [...byCurrency.values()].sort((a, b) => {
    if (a.atRiskYearlyMinor !== b.atRiskYearlyMinor) {
      return a.atRiskYearlyMinor > b.atRiskYearlyMinor ? -1 : 1;
    }
    if (a.yearlyMinor !== b.yearlyMinor) {
      return a.yearlyMinor > b.yearlyMinor ? -1 : 1;
    }
    return a.currency.localeCompare(b.currency);
  });
};

const parseVendorMatch = (row: DetectedSubscription): VendorMatch => {
  const fallback: VendorMatch = {
    vendorId: null,
    name: row.service,
    category: row.category,
    ...(row.vendor ? { via: row.vendor } : {}),
    known: false,
  };
  const value = row.vendorMatch;
  if (null === value || 'object' !== typeof value || Array.isArray(value)) {
    return fallback;
  }
  const stored = value as Partial<Record<keyof VendorMatch, unknown>>;
  return {
    ...fallback,
    vendorId: 'string' === typeof stored.vendorId ? stored.vendorId : null,
    ...('string' === typeof stored.catalogId ? { catalogId: stored.catalogId } : {}),
    ...('number' === typeof stored.trialDays ? { trialDays: stored.trialDays } : {}),
    known: true === stored.known,
  };
};

/** Rebuilds the scan item a stored row came from (name and category may have been edited). */
export const rowToScanItem = (row: DetectedSubscription): StoredScanItem => {
  const fallbackDate = toCalendarDate(row.createdAt);
  return {
    id: row.id,
    status: row.status,
    fingerprint: row.fingerprint,
    vendor: parseVendorMatch(row),
    rawDescriptions: row.evidence.slice(0, 3),
    currency: row.estimatedCurrency ?? 'USD',
    cadence: isCadence(row.cadence) ? row.cadence : null,
    amountMinor: row.estimatedAmount ?? 0n,
    previousAmountMinor: row.previousAmount,
    firstSeen: row.firstSeenAt ? toCalendarDate(row.firstSeenAt) : fallbackDate,
    lastCharged: row.lastChargedAt ? toCalendarDate(row.lastChargedAt) : fallbackDate,
    nextRenewal: row.nextRenewalAt ? toCalendarDate(row.nextRenewalAt) : null,
    chargeCount: row.chargeCount ?? 0,
    yearlyMinor: row.yearlyAmount ?? 0n,
    atRiskYearlyMinor: row.atRiskYearly ?? 0n,
    flags: row.flags.filter(isFlag),
    duplicateOf: row.duplicateOf,
    confidence: isConfidence(row.confidence) ? row.confidence : 'low',
    source: 'invoice_export' === row.source ? 'invoice_export' : 'statement',
  };
};

/** Columns refreshed on every scan, whatever the row's status. */
const scanColumns = (item: ScanItem, scanId: string) => ({
  source: item.source,
  cadence: item.cadence,
  firstSeenAt: calendarDateToUtcNoon(item.firstSeen),
  lastChargedAt: calendarDateToUtcNoon(item.lastCharged),
  nextRenewalAt: fromCalendarDate(item.nextRenewal),
  chargeCount: item.chargeCount,
  flags: item.flags,
  estimatedAmount: item.amountMinor,
  estimatedCurrency: item.currency,
  previousAmount: item.previousAmountMinor,
  yearlyAmount: item.yearlyMinor,
  atRiskYearly: item.atRiskYearlyMinor,
  confidence: item.confidence,
  duplicateOf: item.duplicateOf,
  vendorMatch: {
    vendorId: item.vendor.vendorId,
    name: item.vendor.name,
    category: item.vendor.category,
    catalogId: item.vendor.catalogId ?? null,
    trialDays: item.vendor.trialDays ?? null,
    via: item.vendor.via ?? null,
    known: item.vendor.known,
  } satisfies Prisma.InputJsonObject,
  scanId,
});

// ---------------------------------------------------------------------------------------------
// Inspect / scan
// ---------------------------------------------------------------------------------------------

const isMappingComplete = (mapping: ImportMapping) =>
  REQUIRED_IMPORT_FIELDS.every((field) => 'number' === typeof mapping[field]);

/**
 * Bank-layout fixes (debit/credit columns, Revolut states, …) with the mapping, date order and
 * sign guessed on the rewritten table, which is what the user maps and `scan` reads.
 */
const prepareTable = (table: ParsedTable) => {
  const prepared = prepareStatementTable(table);
  return {
    table: prepared.table,
    inspection: {
      ...columnsGuessFrom(prepared.table),
      mapping: prepared.mapping,
      amountSign: prepared.amountSign,
      dateFormat: prepared.dateFormat,
      currency: prepared.currency,
    } satisfies UploadInspection,
  };
};

export const inspectStatement = async (
  file: UploadFile,
): Promise<{
  kind: ScanSource;
  inspection: UploadInspection;
  mappingComplete: boolean;
}> => {
  const table = await loadUpload(file);
  const problem = statementTableProblem(table);
  if (problem) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: problem });
  }
  if (detectInvoiceExport(table.headers)) {
    return { kind: 'invoice_export', inspection: columnsGuessFrom(table), mappingComplete: true };
  }
  const { inspection } = prepareTable(table);
  return {
    kind: 'statement',
    inspection,
    mappingComplete: isMappingComplete(inspection.mapping),
  };
};

const chargesFrom = (table: ParsedTable, options: ScanOptions) => {
  const defaultCurrency = options.defaultCurrency.toUpperCase();
  const layout = detectInvoiceExport(table.headers);
  if (layout) {
    return {
      source: 'invoice_export' as const,
      charges: invoiceRowsToCharges(table, layout, defaultCurrency),
    };
  }
  const prepared = prepareTable(table).table;
  const rows = normaliseRows(prepared, {
    format: detectFormat(prepared.headers),
    mapping: options.mapping,
    dateFormat: options.dateFormat,
    defaultCurrency,
    amountSign: options.amountSign,
  });
  return { source: 'statement' as const, charges: importRowsToCharges(rows) };
};

/** Upserts every detected item; DISMISSED / ADDED rows keep their status but get fresh numbers. */
const storeItems = async (
  db: PrismaClient,
  userId: number,
  items: readonly ScanItem[],
  scanId: string,
): Promise<StoredScanItem[]> => {
  if (0 === items.length) {
    return [];
  }
  const existing = await db.detectedSubscription.findMany({
    where: { userId, fingerprint: { in: items.map((item) => item.fingerprint) } },
    select: {
      fingerprint: true,
      evidence: true,
      status: true,
      estimatedAmount: true,
      cadence: true,
    },
  });
  const existingByFingerprint = new Map(existing.map((row) => [row.fingerprint, row]));

  const rows = await db.$transaction(
    items.map((item) => {
      const columns = scanColumns(item, scanId);
      const saved = existingByFingerprint.get(item.fingerprint);
      // A statement can't tell a trial's price, so a rescan keeps the one the user saved.
      const keepSavedPrice =
        'ADDED' === saved?.status && 0n === item.amountMinor && 0n < (saved.estimatedAmount ?? 0n);
      return db.detectedSubscription.upsert({
        where: { userId_fingerprint: { userId, fingerprint: item.fingerprint } },
        create: {
          userId,
          fingerprint: item.fingerprint,
          service: item.vendor.name,
          vendor: item.vendor.via ?? null,
          category: item.vendor.category,
          evidence: mergeEvidence([], item.rawDescriptions),
          agent: STATEMENT_AGENT,
          ...columns,
        },
        update: {
          evidence: mergeEvidence(saved?.evidence ?? [], item.rawDescriptions),
          ...columns,
          ...(keepSavedPrice && {
            estimatedAmount: saved.estimatedAmount,
            cadence: saved.cadence,
          }),
        },
        select: { id: true, status: true, estimatedAmount: true, cadence: true },
      });
    }),
  );

  return items.map((item, index) => {
    const row = rows[index];
    if (!row) {
      throw new Error('Statement scan upsert lost a row');
    }
    return {
      ...item,
      id: row.id,
      status: row.status,
      amountMinor: row.estimatedAmount ?? item.amountMinor,
      cadence: isCadence(row.cadence) ? row.cadence : item.cadence,
    };
  });
};

export const scanStatement = async (
  db: PrismaClient,
  userId: number,
  file: UploadFile,
  options: ScanOptions,
  now = new Date(),
): Promise<{ scanId: string; report: ScanReport; items: StoredScanItem[] }> => {
  const table = await loadUpload(file);
  const { source, charges } = chargesFrom(table, options);
  const report = detectSubscriptions(charges, {
    today: calendarDateInZone(now, options.timeZone),
    source,
  });
  const scanId = newScanId(now.getTime());
  const items = await storeItems(db, userId, report.items, scanId);
  return { scanId, report, items };
};

export const latestScan = async (
  db: PrismaClient,
  userId: number,
): Promise<{ scanId: string; items: StoredScanItem[]; totals: ScanTotals[] } | null> => {
  const newest = await db.detectedSubscription.findFirst({
    where: { userId, agent: STATEMENT_AGENT, scanId: { not: null } },
    orderBy: { scanId: 'desc' },
    select: { scanId: true },
  });
  if (!newest?.scanId) {
    return null;
  }
  const rows = await db.detectedSubscription.findMany({
    where: { userId, agent: STATEMENT_AGENT, scanId: newest.scanId },
    orderBy: [{ atRiskYearly: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  const items = rows.map(rowToScanItem);
  return {
    scanId: newest.scanId,
    items,
    // "Not a subscription" rows no longer count towards the headline.
    totals: totalsFor(items.filter((item) => 'DISMISSED' !== item.status)),
  };
};

// ---------------------------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------------------------

class ConfirmItemError extends Error {
  readonly code: ConfirmErrorCode;

  constructor(code: ConfirmErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Removes a subscription whose follow-up steps failed, like createExpense does on failure. */
const undoSubscription = async (db: PrismaClient, expenseId: string) => {
  await db.$executeRaw`SELECT cron.unschedule(${expenseId})`.catch(console.error);
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: { recurrenceId: true },
  });
  await db
    .$transaction([
      db.expense.deleteMany({ where: { id: expenseId } }),
      ...(expense?.recurrenceId
        ? [db.expenseRecurrence.deleteMany({ where: { id: expense.recurrenceId } })]
        : []),
    ])
    .catch(console.error);
};

const confirmSubscription = async (
  db: PrismaClient,
  userId: number,
  row: DetectedSubscription,
  input: ConfirmDecision,
  now: Date,
): Promise<ConfirmResult['created'][number]> => {
  const amount = input.amountMinor ?? row.estimatedAmount ?? 0n;
  if (0n >= amount) {
    throw new ConfirmItemError('amount_required');
  }

  const flags = row.flags.filter(isFlag);
  const isTrial = flags.includes('trial');
  const cadence = input.cadence ?? (isCadence(row.cadence) ? row.cadence : 'monthly');
  const today = toCalendarDate(now);
  const lastCharged = row.lastChargedAt ? toCalendarDate(row.lastChargedAt) : null;
  const nextRenewal =
    input.nextRenewal ??
    (row.nextRenewalAt ? toCalendarDate(row.nextRenewalAt) : null) ??
    nextRenewalAfter(lastCharged, cadence, today);
  const name = input.name?.trim() || row.service;
  const remindDaysBefore = reminderDaysFor({ cadence, flags }, input.decision);
  const cancelling = 'cancel' === input.decision;
  const trialTemplateDate = previousCycleDate(nextRenewal, cadence);
  const realChargeDate = row.lastChargedAt ?? now;

  // Claim the row so a double submit can't create two subscriptions.
  const claimed = await db.detectedSubscription.updateMany({
    where: { id: row.id, userId, status: 'PENDING', decision: null },
    data: { decision: input.decision },
  });
  if (0 === claimed.count) {
    throw new ConfirmItemError('not_found');
  }

  const release = () =>
    db.detectedSubscription
      .updateMany({ where: { id: row.id, status: 'PENDING' }, data: { decision: null } })
      .catch(console.error);

  const expense = await createExpense(
    {
      paidBy: userId,
      name,
      category: row.category,
      amount,
      groupId: null,
      splitType: SplitType.EQUAL,
      currency: row.estimatedCurrency ?? 'USD',
      participants: [{ userId, amount }],
      expenseDate: isTrial && trialTemplateDate < now ? trialTemplateDate : realChargeDate,
      cronExpression: cadenceCron(cadence, nextRenewal),
      ...(cancelling && { needsReview: true, reviewReasons: [PLANNED_TO_CANCEL_REASON] }),
    },
    userId,
  ).catch(async (error: unknown) => {
    await release();
    throw error;
  });

  try {
    await db.$transaction(async (tx) => {
      const recurrence = await tx.expenseRecurrence.updateMany({
        where: { expense: { some: { id: expense.id } } },
        data: {
          remindDaysBefore,
          ...('using' === input.decision && { lastConfirmedUsedAt: now }),
        },
      });
      if (1 !== recurrence.count) {
        throw new Error('Subscription recurrence missing');
      }
      await tx.detectedSubscription.update({
        where: { id: row.id },
        data: {
          status: 'ADDED',
          expenseId: expense.id,
          decision: input.decision,
          // The handled list shows what was saved, including a typed price or a new name.
          service: name,
          estimatedAmount: amount,
          cadence,
          nextRenewalAt: calendarDateToUtcNoon(nextRenewal),
        },
      });
    });
  } catch (error) {
    await undoSubscription(db, expense.id);
    await release();
    throw error;
  }

  return { id: row.id, expenseId: expense.id, remindDaysBefore };
};

export const confirmScanDecisions = async (
  db: PrismaClient,
  userId: number,
  decisions: readonly ConfirmDecision[],
  now = new Date(),
): Promise<ConfirmResult> => {
  const rows = await db.detectedSubscription.findMany({
    where: { userId, id: { in: [...new Set(decisions.map((item) => item.id))] } },
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  // One at a time: each subscription owns a pg_cron job and its own clean-up on failure.
  return decisions.reduce<Promise<ConfirmResult>>(
    async (previous, input) => {
      const result = await previous;
      const row = rowsById.get(input.id);
      if (!row || 'PENDING' !== row.status) {
        return { ...result, errors: [...result.errors, { id: input.id, code: 'not_found' }] };
      }

      if ('not_subscription' === input.decision) {
        const { count } = await db.detectedSubscription.updateMany({
          where: { id: row.id, userId, status: 'PENDING' },
          data: { status: 'DISMISSED', decision: input.decision },
        });
        rowsById.delete(row.id);
        return 0 === count
          ? { ...result, errors: [...result.errors, { id: input.id, code: 'not_found' }] }
          : { ...result, dismissed: result.dismissed + 1 };
      }

      try {
        const created = await confirmSubscription(db, userId, row, input, now);
        rowsById.delete(row.id);
        return { ...result, created: [...result.created, created] };
      } catch (error) {
        const code = error instanceof ConfirmItemError ? error.code : 'failed';
        if ('failed' === code) {
          console.error('Statement scan confirm failed', error);
        }
        return { ...result, errors: [...result.errors, { id: input.id, code }] };
      }
    },
    Promise.resolve({ created: [], dismissed: 0, errors: [] }),
  );
};

/** True for a real calendar date (no Feb 30). */
export const isRealCalendarDate = ({ year, month, day }: CalendarDate) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year === date.getUTCFullYear() && month === date.getUTCMonth() + 1 && day === date.getUTCDate()
  );
};
