import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { type Prisma, SplitType } from '@prisma/client';
import { TRPCError } from '@trpc/server';

import { db } from '~/server/db';
import { createExpenseSchema } from '~/types/expense.types';

import { columnsGuessFrom } from './inspect';
import { calendarDateInZone, calendarDateToUtcNoon } from './dates';
import { type ExportExpense, buildCsv, toExportRow } from './exportRows';
import { getExportLabels, toDataioLocale } from './labels';
import {
  type ExistingExpense,
  type ImportRow,
  findDuplicates,
  isImportable,
  normaliseRows,
  toPreviewRow,
} from './normalise';
import { buildParticipants } from './participants';
import { UploadError, decodeUpload, readTable } from './table';
import {
  type ExportInput,
  IMPORT_BATCH_SIZE,
  type ImportOptions,
  type ImportOutcomeRow,
  type ImportResult,
  MAX_EXPORT_ROWS,
} from './types';
import { buildXlsx } from './xlsx';
import { detectFormat } from './columns';

const EXPORT_PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const exportInclude = {
  paidByUser: { select: { id: true, name: true, email: true } },
  group: { select: { name: true } },
  expenseParticipants: {
    select: { userId: true, amount: true, user: { select: { id: true, name: true, email: true } } },
  },
  expenseNotes: { select: { note: true }, orderBy: { createdAt: 'asc' } },
  recurrence: { select: { job: { select: { schedule: true } } } },
} satisfies Prisma.ExpenseInclude;

/** Membership check shared by export and import; import also refuses archived projects. */
export const getGroupForMember = async (
  groupId: number,
  userId: number,
  { forWrite }: { forWrite: boolean },
) => {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, archivedAt: true, groupUsers: { select: { userId: true } } },
  });
  if (!group || !group.groupUsers.some((member) => member.userId === userId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a group member' });
  }
  if (forWrite && group.archivedAt) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Group is archived' });
  }
  return group;
};

const exportWhere = async (
  userId: number,
  input: ExportInput,
): Promise<Prisma.ExpenseWhereInput> => {
  const range: Prisma.ExpenseWhereInput = {
    deletedAt: null,
    expenseDate: {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lt: input.to } : {}),
    },
  };
  const involvesMe: Prisma.ExpenseWhereInput = {
    OR: [{ paidBy: userId }, { expenseParticipants: { some: { userId } } }],
  };
  if ('group' === input.scope.type) {
    await getGroupForMember(input.scope.groupId, userId, { forWrite: false });
    return { ...range, groupId: input.scope.groupId };
  }
  if ('friend' === input.scope.type) {
    // Only expenses both of you are in: never another person's private data.
    return {
      ...range,
      AND: [
        { expenseParticipants: { some: { userId } } },
        { expenseParticipants: { some: { userId: input.scope.friendId } } },
      ],
    };
  }
  return { ...range, ...involvesMe };
};

/** Load matching expenses newest first, page by page, up to {@link MAX_EXPORT_ROWS}. */
const loadExportExpenses = async (where: Prisma.ExpenseWhereInput) => {
  const load = async (
    acc: ExportExpense[],
    cursor: string | undefined,
  ): Promise<{ expenses: ExportExpense[]; truncated: boolean }> => {
    const page = await db.expense.findMany({
      where,
      include: exportInclude,
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
      take: EXPORT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const next = [...acc, ...page];
    if (MAX_EXPORT_ROWS <= next.length) {
      return { expenses: next.slice(0, MAX_EXPORT_ROWS), truncated: true };
    }
    if (EXPORT_PAGE_SIZE > page.length) {
      return { expenses: next, truncated: false };
    }
    return load(next, page.at(-1)?.id);
  };
  return load([], undefined);
};

export const runExport = async (userId: number, input: ExportInput) => {
  const where = await exportWhere(userId, input);
  const { expenses, truncated } = await loadExportExpenses(where);
  const labels = getExportLabels(toDataioLocale(input.locale));
  const rows = expenses.map((expense) =>
    toExportRow(expense, { userId, labels, timeZone: input.timeZone }),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  const body =
    'xlsx' === input.format
      ? await buildXlsx(rows, labels)
      : Buffer.from(buildCsv(rows, labels), 'utf8');
  return {
    fileName: `safi-expenses-${stamp}.${input.format}`,
    mimeType:
      'xlsx' === input.format
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8',
    // Gzip keeps large CSVs under the response size limit; the browser inflates it.
    gzipBase64: gzipSync(body).toString('base64'),
    rowCount: rows.length,
    truncated,
  };
};

const toTrpcError = (error: unknown): never => {
  if (error instanceof UploadError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error.code });
  }
  throw error;
};

export const loadUpload = async (file: { name: string; gzipBase64: string }) => {
  try {
    return await readTable(file.name, decodeUpload(file.gzipBase64));
  } catch (error) {
    return toTrpcError(error);
  }
};

export const inspectUpload = async (file: { name: string; gzipBase64: string }) => {
  const table = await loadUpload(file);
  return columnsGuessFrom(table);
};

/** Expenses you are part of around the imported dates (and any Safi IDs in the file). */
const loadExisting = async (
  userId: number,
  rows: readonly ImportRow[],
  timeZone: string,
): Promise<ExistingExpense[]> => {
  const times = rows.flatMap((row) =>
    row.date ? [calendarDateToUtcNoon(row.date).getTime()] : [],
  );
  const ids = rows.flatMap((row) => (row.expenseId ? [row.expenseId] : []));
  if (0 === times.length && 0 === ids.length) {
    return [];
  }
  const or: Prisma.ExpenseWhereInput[] = [];
  if (0 < times.length) {
    or.push({
      expenseDate: {
        gte: new Date(Math.min(...times) - 2 * DAY_MS),
        lte: new Date(Math.max(...times) + 2 * DAY_MS),
      },
    });
  }
  if (0 < ids.length) {
    or.push({ id: { in: [...new Set(ids)] } });
  }
  const existing = await db.expense.findMany({
    where: {
      deletedAt: null,
      AND: [
        { OR: [{ paidBy: userId }, { expenseParticipants: { some: { userId } } }] },
        { OR: or },
      ],
    },
    select: { id: true, expenseDate: true, amount: true, currency: true, name: true },
  });
  return existing.map((expense) => ({
    id: expense.id,
    date: calendarDateInZone(expense.expenseDate, timeZone),
    amount: expense.amount,
    currency: expense.currency,
    name: expense.name,
  }));
};

const prepareRows = async (
  userId: number,
  file: { name: string; gzipBase64: string },
  options: ImportOptions,
) => {
  if ('group' === options.target.type) {
    await getGroupForMember(options.target.groupId, userId, { forWrite: true });
  }
  const table = await loadUpload(file);
  const rows = normaliseRows(table, {
    format: detectFormat(table.headers),
    mapping: options.mapping,
    dateFormat: options.dateFormat,
    defaultCurrency: options.defaultCurrency.toUpperCase(),
    amountSign: options.amountSign,
  });
  const duplicates = findDuplicates(rows, await loadExisting(userId, rows, options.timeZone));
  return { rows, duplicates };
};

export const previewImport = async (
  userId: number,
  file: { name: string; gzipBase64: string },
  options: ImportOptions,
) => {
  const { rows, duplicates } = await prepareRows(userId, file, options);
  return rows.map((row) => toPreviewRow(row, duplicates.get(row.index) ?? null));
};

const IMPORT_REVIEW_REASON = 'note:Imported from a file';

const toExpenseData = (
  row: ImportRow,
  userId: number,
  options: ImportOptions,
  memberIds: readonly number[],
) => {
  const groupId = 'group' === options.target.type ? options.target.groupId : null;
  const mode = 'group' === options.target.type ? options.target.split : ('personal' as const);
  const amount = row.amountMinor ?? 0n;
  const candidate = {
    paidBy: userId,
    name: row.description,
    category: row.category,
    amount,
    groupId,
    splitType: SplitType.EQUAL,
    currency: row.currency,
    participants: buildParticipants({ amount, payerId: userId, memberIds, mode }),
    expenseDate: row.date ? calendarDateToUtcNoon(row.date) : new Date(),
  };
  // Same validation the add-expense mutation applies.
  return createExpenseSchema.parse(candidate);
};

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

export const commitImport = async (
  userId: number,
  file: { name: string; gzipBase64: string },
  options: ImportOptions,
  include: readonly number[],
): Promise<ImportResult> => {
  const { rows, duplicates } = await prepareRows(userId, file, options);
  const memberIds =
    'group' === options.target.type
      ? (
          await getGroupForMember(options.target.groupId, userId, { forWrite: true })
        ).groupUsers.map((member) => member.userId)
      : [userId];
  const selected = new Set(include);
  const skipped: ImportOutcomeRow[] = [];
  const failed: ImportOutcomeRow[] = [];
  const outcome = (row: ImportRow, reason: ImportOutcomeRow['reason']): ImportOutcomeRow => ({
    line: row.line,
    description: row.description,
    reason,
  });

  const toImport = rows.filter((row) => {
    const [firstError] = row.errors;
    if (firstError) {
      failed.push(outcome(row, firstError));
      return false;
    }
    if (row.skip) {
      skipped.push(outcome(row, row.skip));
      return false;
    }
    if (!selected.has(row.index)) {
      skipped.push(outcome(row, duplicates.get(row.index) ?? 'not_selected'));
      return false;
    }
    return isImportable(row);
  });

  const prepared = toImport.flatMap((row) => {
    try {
      return [{ row, id: randomUUID(), data: toExpenseData(row, userId, options, memberIds) }];
    } catch {
      failed.push(outcome(row, 'invalid_amount'));
      return [];
    }
  });

  let imported = 0;
  // Batches run one after another so a failure only affects its own batch.
  // oxlint-disable no-await-in-loop
  for (const batch of chunk(prepared, IMPORT_BATCH_SIZE)) {
    try {
      await db.$transaction([
        db.expense.createMany({
          data: batch.map(({ id, data, row }) => ({
            id,
            paidBy: data.paidBy,
            addedBy: userId,
            name: data.name,
            category: data.category,
            amount: data.amount,
            splitType: data.splitType,
            currency: data.currency,
            groupId: data.groupId,
            expenseDate: data.expenseDate,
            ...(row.needsReview
              ? { needsReview: true, reviewReasons: [IMPORT_REVIEW_REASON] }
              : {}),
          })),
        }),
        db.expenseParticipant.createMany({
          data: batch.flatMap(({ id, data }) =>
            data.participants.map((participant) => ({ ...participant, expenseId: id })),
          ),
        }),
        db.expenseNote.createMany({
          data: batch.flatMap(({ id, row }) =>
            row.notes ? [{ expenseId: id, note: row.notes, createdById: userId }] : [],
          ),
        }),
      ]);
      imported += batch.length;
    } catch (error) {
      console.error('Import batch failed', error);
      batch.forEach(({ row }) => failed.push(outcome(row, 'database_error')));
    }
  }
  // oxlint-enable no-await-in-loop

  const byLine = (a: ImportOutcomeRow, b: ImportOutcomeRow) => a.line - b.line;
  return { imported, skipped: skipped.sort(byLine), failed: failed.sort(byLine) };
};
