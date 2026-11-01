import { findService } from '~/lib/serviceCatalog';

import { usageServiceKey } from './helpers';

/** A subscription with no sign of use for this many days counts as unused. */
export const UNUSED_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type UsageSignalKind = 'confirmed' | 'seen_in_repo' | 'usage_expense';

/** Evidence that a recurring subscription is still in use. Every field is optional data. */
export interface UsageSignals {
  /** When the subscription started (its oldest expense). Unknown start → never flagged. */
  startedAt: Date | null;
  /** The user tapped "Still using". */
  lastConfirmedUsedAt: Date | null;
  /** The subscription-monitor skill last found the service in a repo (heartbeat). */
  lastSeenInRepoAt: Date | null;
  /** Newest non-recurring (usage) expense for the same service. */
  lastUsageExpenseAt: Date | null;
}

export interface UsageStatus {
  unused: boolean;
  /** Newest usage signal, or null when there is none. */
  lastUsedAt: Date | null;
  lastUsedSignal: UsageSignalKind | null;
}

export const unusedCutoff = (now: Date): Date =>
  new Date(now.getTime() - UNUSED_AFTER_DAYS * DAY_MS);

/**
 * A subscription is unused when it started more than 30 days ago and none of its usage signals
 * (still-using tap, repo heartbeat, usage expense) falls within the last 30 days.
 */
export const getUsageStatus = (signals: UsageSignals, now: Date): UsageStatus => {
  const candidates = (
    [
      ['confirmed', signals.lastConfirmedUsedAt],
      ['seen_in_repo', signals.lastSeenInRepoAt],
      ['usage_expense', signals.lastUsageExpenseAt],
    ] as const
  ).filter((entry): entry is readonly [UsageSignalKind, Date] => null !== entry[1]);

  const newest = candidates.reduce<readonly [UsageSignalKind, Date] | null>(
    (best, entry) => (null === best || entry[1].getTime() > best[1].getTime() ? entry : best),
    null,
  );

  const cutoff = unusedCutoff(now).getTime();
  const isEstablished = null !== signals.startedAt && signals.startedAt.getTime() <= cutoff;
  const hasRecentUse = null !== newest && newest[1].getTime() >= cutoff;

  return {
    unused: isEstablished && !hasRecentUse,
    lastUsedAt: newest?.[1] ?? null,
    lastUsedSignal: newest?.[0] ?? null,
  };
};

/** Service keys a detected subscription can match: its service name and catalog id. */
export const detectedServiceKeys = (detected: { fingerprint: string; service: string }) => {
  const catalogId = findService(detected.fingerprint)?.id;
  return [usageServiceKey(detected.service), ...(catalogId ? [catalogId] : [])];
};

const maxDate = (a: Date | null | undefined, b: Date): Date =>
  a && a.getTime() >= b.getTime() ? a : b;

/**
 * Newest repo heartbeat per service key, from the user's detected subscriptions. Rows the user
 * dismissed still count: dismissing a suggestion does not mean the service stopped being used.
 */
export const lastSeenByServiceKey = (
  detected: { fingerprint: string; service: string; lastSeenAt: Date | null }[],
): Map<string, Date> =>
  detected.reduce((acc, row) => {
    const { lastSeenAt } = row;
    if (!lastSeenAt) {
      return acc;
    }
    detectedServiceKeys(row).forEach((key) => acc.set(key, maxDate(acc.get(key), lastSeenAt)));
    return acc;
  }, new Map<string, Date>());

/** Newest expense date per service key. */
export const lastExpenseByServiceKey = (
  expenses: { name: string; expenseDate: Date }[],
): Map<string, Date> =>
  expenses.reduce((acc, expense) => {
    const key = usageServiceKey(expense.name);
    acc.set(key, maxDate(acc.get(key), expense.expenseDate));
    return acc;
  }, new Map<string, Date>());
