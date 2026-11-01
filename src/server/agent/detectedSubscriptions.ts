import { type DetectedSubscription, Prisma, type PrismaClient } from '@prisma/client';

import {
  type DetectedSubscriptionReport,
  formatMinorUnits,
  mergeEvidence,
  parseAmountToMinorUnits,
} from './validation';

export const MAX_LISTED_DETECTED_SUBSCRIPTIONS = 100;

type DetectedSubscriptionStatusValue = DetectedSubscription['status'];

export interface SerializedDetectedSubscription {
  id: string;
  fingerprint: string;
  service: string;
  vendor: string | null;
  category: string;
  status: 'pending' | 'added' | 'dismissed';
  detectedIn: string | null;
  evidence: string[];
  estimatedMonthlyCost: { amount: string; currency: string } | null;
  pricingUrl: string | null;
  agent: string | null;
  expenseId: string | null;
  createdAt: string;
  updatedAt: string;
}

const API_STATUS = {
  PENDING: 'pending',
  ADDED: 'added',
  DISMISSED: 'dismissed',
} as const satisfies Record<DetectedSubscriptionStatusValue, string>;

export const toApiStatus = (
  status: DetectedSubscriptionStatusValue,
): SerializedDetectedSubscription['status'] => API_STATUS[status];

export const serializeDetectedSubscription = (
  row: DetectedSubscription,
): SerializedDetectedSubscription => ({
  id: row.id,
  fingerprint: row.fingerprint,
  service: row.service,
  vendor: row.vendor,
  category: row.category,
  status: toApiStatus(row.status),
  detectedIn: row.detectedIn,
  evidence: row.evidence,
  estimatedMonthlyCost:
    null !== row.estimatedAmount && null !== row.estimatedCurrency
      ? {
          amount: formatMinorUnits(row.estimatedAmount, row.estimatedCurrency),
          currency: row.estimatedCurrency,
        }
      : null,
  pricingUrl: row.pricingUrl,
  agent: row.agent,
  expenseId: row.expenseId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Maps a validated report to the columns of a new DetectedSubscription row. */
export const reportToCreateData = (userId: number, report: DetectedSubscriptionReport) => ({
  userId,
  fingerprint: report.fingerprint,
  service: report.service,
  vendor: report.vendor ?? null,
  category: report.category,
  detectedIn: report.detectedIn ?? null,
  evidence: mergeEvidence([], report.evidence),
  estimatedAmount: report.estimatedMonthlyCost
    ? parseAmountToMinorUnits(
        report.estimatedMonthlyCost.amount,
        report.estimatedMonthlyCost.currency,
      )
    : null,
  estimatedCurrency: report.estimatedMonthlyCost?.currency ?? null,
  pricingUrl: report.pricingUrl ?? null,
  agent: report.agent ?? null,
});

type ExistingForMerge = Pick<
  DetectedSubscription,
  'status' | 'evidence' | 'vendor' | 'detectedIn' | 'estimatedAmount' | 'pricingUrl' | 'agent'
>;

/**
 * Decides what a duplicate report does to an existing row (pure, unit-tested).
 * - DISMISSED rows are never re-opened or changed (returns null).
 * - PENDING/ADDED rows get new evidence merged in, and empty optional fields filled in.
 */
export const buildDuplicateUpdate = (
  existing: ExistingForMerge,
  report: DetectedSubscriptionReport,
): Prisma.DetectedSubscriptionUpdateInput | null => {
  if ('DISMISSED' === existing.status) {
    return null;
  }

  const incoming = reportToCreateData(0, report);
  const update: Prisma.DetectedSubscriptionUpdateInput = {
    evidence: mergeEvidence(existing.evidence, report.evidence),
  };

  if (null === existing.vendor && incoming.vendor) {
    update.vendor = incoming.vendor;
  }
  if (null === existing.detectedIn && incoming.detectedIn) {
    update.detectedIn = incoming.detectedIn;
  }
  if (null === existing.pricingUrl && incoming.pricingUrl) {
    update.pricingUrl = incoming.pricingUrl;
  }
  if (null === existing.agent && incoming.agent) {
    update.agent = incoming.agent;
  }
  if (null === existing.estimatedAmount && null !== incoming.estimatedAmount) {
    update.estimatedAmount = incoming.estimatedAmount;
    update.estimatedCurrency = incoming.estimatedCurrency;
  }

  return update;
};

export interface ReportResult {
  id: string;
  status: SerializedDetectedSubscription['status'];
  duplicate: boolean;
}

const handleDuplicate = async (
  db: PrismaClient,
  existing: DetectedSubscription,
  report: DetectedSubscriptionReport,
): Promise<ReportResult> => {
  const update = buildDuplicateUpdate(existing, report);
  if (!update) {
    return { id: existing.id, status: toApiStatus(existing.status), duplicate: true };
  }
  const updated = await db.detectedSubscription.update({
    where: { id: existing.id },
    data: update,
  });
  return { id: updated.id, status: toApiStatus(updated.status), duplicate: true };
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && 'P2002' === error.code;

/** Records a report from a coding agent, de-duplicating on (userId, fingerprint). */
export const recordDetectedSubscription = async (
  db: PrismaClient,
  userId: number,
  report: DetectedSubscriptionReport,
): Promise<ReportResult> => {
  const where = { userId_fingerprint: { userId, fingerprint: report.fingerprint } };
  const existing = await db.detectedSubscription.findUnique({ where });
  if (existing) {
    return handleDuplicate(db, existing, report);
  }

  try {
    const created = await db.detectedSubscription.create({
      data: reportToCreateData(userId, report),
    });
    return { id: created.id, status: toApiStatus(created.status), duplicate: false };
  } catch (error) {
    // A concurrent report with the same fingerprint won the race; treat ours as a duplicate.
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const raced = await db.detectedSubscription.findUnique({ where });
    if (!raced) {
      throw error;
    }
    return handleDuplicate(db, raced, report);
  }
};

export const listDetectedSubscriptions = async (
  db: PrismaClient,
  userId: number,
  status?: DetectedSubscriptionStatusValue,
) => {
  const rows = await db.detectedSubscription.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: MAX_LISTED_DETECTED_SUBSCRIPTIONS,
  });
  return rows.map(serializeDetectedSubscription);
};
