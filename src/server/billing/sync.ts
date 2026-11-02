import { type BillingConnection, Prisma, type PrismaClient } from '@prisma/client';

import { TokenCryptoError, decryptToken, tokenAad } from './crypto';
import {
  type BillingImportRow,
  BillingProviderError,
  aggregateCharges,
  fetchVercelCharges,
  syncWindow,
  vercelExpenseName,
} from './providers/vercel';

/** Errors that need the user to act (new token or role); the connection stops syncing. */
const BLOCKING_ERRORS = new Set(['unauthorized', 'forbidden', 'token_unreadable']);

export type SyncErrorCode =
  | BillingProviderError['code']
  | 'token_unreadable'
  | 'unsupported_provider'
  | 'unknown';

export interface ApplyResult {
  created: number;
  updated: number;
  unchanged: number;
}

export type SyncResult =
  | ({ ok: true; skippedLines: number } & ApplyResult)
  | { ok: false; error: SyncErrorCode };

type SyncConnection = Pick<
  BillingConnection,
  'id' | 'userId' | 'provider' | 'groupId' | 'externalAccountId' | 'encryptedToken' | 'status'
>;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && 'P2002' === error.code;

/** Noon UTC keeps the date inside the same calendar day for every viewer time zone. */
const expenseDateFor = (row: BillingImportRow) => new Date(`${row.lastChargeDay}T12:00:00Z`);

/** The connection's project when the owner still belongs to it, else null (personal). */
export const resolveTargetGroup = async (
  db: PrismaClient,
  { userId, groupId }: { userId: number; groupId: number | null },
): Promise<number | null> => {
  if (null === groupId) {
    return null;
  }
  const membership = await db.groupUser.findFirst({
    where: { groupId, userId, group: { archivedAt: null } },
    select: { groupId: true },
  });
  return membership?.groupId ?? null;
};

/**
 * Upserts one expense per (connection, month, service) through the BillingImport ledger.
 * Existing rows update the expense amount in place when it changed; a re-run with the same
 * charges changes nothing. Expenses the user deleted are not brought back.
 */
export const applyImports = async (
  db: PrismaClient,
  {
    connection,
    rows,
    groupId,
  }: {
    connection: Pick<SyncConnection, 'id' | 'userId'>;
    rows: BillingImportRow[];
    groupId: number | null;
  },
): Promise<ApplyResult> => {
  const result: ApplyResult = { created: 0, updated: 0, unchanged: 0 };
  if (0 === rows.length) {
    return result;
  }

  const existing = await db.billingImport.findMany({
    where: { connectionId: connection.id, periodKey: { in: rows.map((row) => row.periodKey) } },
    select: { id: true, periodKey: true, expenseId: true, amount: true },
  });
  const byKey = new Map(existing.map((item) => [item.periodKey, item]));

  // Sequential on purpose: a handful of rows per month, and it keeps writes ordered.
  await rows.reduce(async (previous, row) => {
    await previous;
    const known = byKey.get(row.periodKey);

    if (known) {
      if (known.amount === row.amount) {
        result.unchanged += 1;
        return;
      }
      await db.$transaction([
        ...(known.expenseId
          ? [
              db.expense.updateMany({
                where: { id: known.expenseId, deletedAt: null },
                data: { amount: row.amount, expenseDate: expenseDateFor(row) },
              }),
            ]
          : []),
        db.billingImport.update({ where: { id: known.id }, data: { amount: row.amount } }),
      ]);
      result.updated += 1;
      return;
    }

    if (0n >= row.amount) {
      result.unchanged += 1;
      return;
    }

    try {
      await db.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            name: vercelExpenseName(row),
            category: row.category,
            amount: row.amount,
            currency: row.currency,
            splitType: 'EQUAL',
            groupId,
            paidBy: connection.userId,
            addedBy: connection.userId,
            expenseDate: expenseDateFor(row),
            // The owner is the only participant: payer net = amount - full share = 0.
            expenseParticipants: { create: [{ userId: connection.userId, amount: 0n }] },
          },
          select: { id: true },
        });
        await tx.billingImport.create({
          data: {
            connectionId: connection.id,
            periodKey: row.periodKey,
            expenseId: expense.id,
            amount: row.amount,
            currency: row.currency,
          },
        });
      });
      result.created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // A concurrent sync already imported this row; its transaction rolled ours back.
      result.unchanged += 1;
    }
  }, Promise.resolve());

  return result;
};

const errorCodeOf = (error: unknown): SyncErrorCode => {
  if (error instanceof BillingProviderError) {
    return error.code;
  }
  if (error instanceof TokenCryptoError) {
    return 'token_unreadable';
  }
  return 'unknown';
};

export interface SyncOptions {
  key: Buffer;
  now?: Date;
  fetchImpl?: typeof fetch;
  /** Called once when a connection moves into a blocking error state. */
  onBlocked?: (connection: SyncConnection, error: SyncErrorCode) => Promise<void>;
}

/** Imports one connection's charges and records the outcome on the connection. */
export const syncBillingConnection = async (
  db: PrismaClient,
  connection: SyncConnection,
  { key, now = new Date(), fetchImpl, onBlocked }: SyncOptions,
): Promise<SyncResult> => {
  if ('VERCEL' !== connection.provider) {
    return { ok: false, error: 'unsupported_provider' };
  }

  try {
    const token = decryptToken(
      connection.encryptedToken,
      key,
      tokenAad(connection.provider, connection.id),
    );
    const { from, to } = syncWindow(now);
    const charges = await fetchVercelCharges({
      token,
      teamId: connection.externalAccountId,
      from,
      to,
      fetchImpl,
    });
    const { rows, skipped } = aggregateCharges(charges);
    const groupId = await resolveTargetGroup(db, connection);
    const applied = await applyImports(db, { connection, rows, groupId });

    await db.billingConnection.update({
      where: { id: connection.id },
      data: { status: 'active', lastSyncedAt: now, lastError: null },
    });
    return { ok: true, skippedLines: skipped, ...applied };
  } catch (error) {
    const code = errorCodeOf(error);
    const blocking = BLOCKING_ERRORS.has(code);
    // Log the code only: provider errors never carry the token, and unknown errors may.
    console.error(`Billing sync failed for connection ${connection.id}: ${code}`);
    await db.billingConnection.update({
      where: { id: connection.id },
      data: { lastError: code, ...(blocking ? { status: 'error' } : {}) },
    });
    if (blocking && 'error' !== connection.status && onBlocked) {
      await onBlocked(connection, code).catch(() => undefined);
    }
    return { ok: false, error: code };
  }
};

/** Daily job: syncs every active Vercel connection, one at a time. */
export const syncAllBillingConnections = async (db: PrismaClient, options: SyncOptions) => {
  const connections = await db.billingConnection.findMany({
    where: { provider: 'VERCEL', status: 'active' },
    select: {
      id: true,
      userId: true,
      provider: true,
      groupId: true,
      externalAccountId: true,
      encryptedToken: true,
      status: true,
    },
    orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
  });

  const results = await connections.reduce<Promise<SyncResult[]>>(async (previous, connection) => {
    const done = await previous;
    return [...done, await syncBillingConnection(db, connection, options)];
  }, Promise.resolve([]));

  return {
    connections: connections.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  };
};
