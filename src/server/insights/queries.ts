import { Prisma, type PrismaClient } from '@prisma/client';

import { type SpendRow } from './shape';

interface RawSpendRow {
  month: string;
  currency: string;
  category?: string;
  source?: string;
  total: bigint | number | string | null;
  count: number | bigint;
}

const toSpendRow = (row: RawSpendRow): SpendRow => ({
  month: row.month,
  currency: row.currency,
  ...(undefined === row.category ? {} : { category: row.category }),
  ...(undefined === row.source ? {} : { source: 'agent' === row.source ? 'agent' : 'human' }),
  total: BigInt(row.total ?? 0),
  count: Number(row.count),
});

/**
 * Timestamps are stored as UTC wall-clock `timestamp` values. Passing ISO strings and converting
 * them explicitly keeps the comparison independent of how the driver types a JS `Date`.
 */
const iso = (date: Date) => date.toISOString();

/** Period buckets a project chart can be drawn in. Fixed values, so inlining them is safe. */
const PERIOD_SQL = {
  month: { unit: Prisma.raw(`'month'`), format: Prisma.raw(`'YYYY-MM'`) },
  day: { unit: Prisma.raw(`'day'`), format: Prisma.raw(`'YYYY-MM-DD'`) },
} as const;

export type SpendGranularity = keyof typeof PERIOD_SQL;

/**
 * Group spend per local month (or day) × currency × category × source, aggregated in Postgres.
 * Settlements, currency conversions and deleted expenses are excluded, as in the project summary.
 * Amounts are the full expense totals (what the project spent), not one member's share. `source`
 * is "agent" for costs reported through an agent API key (`reportedByApiKeyId`), else "human".
 */
export const getGroupPeriodSpend = async (
  db: PrismaClient,
  {
    groupId,
    start,
    end,
    tzOffset,
    granularity = 'month',
  }: {
    groupId: number;
    start: Date;
    end: Date;
    tzOffset: number;
    granularity?: SpendGranularity;
  },
): Promise<SpendRow[]> => {
  const { unit, format } = PERIOD_SQL[granularity];
  const rows = await db.$queryRaw<RawSpendRow[]>`
    SELECT
      to_char(date_trunc(${unit}, e."expenseDate" - make_interval(mins => ${tzOffset}::int)), ${format}) AS "month",
      e."currency" AS "currency",
      e."category" AS "category",
      CASE WHEN e."reportedByApiKeyId" IS NULL THEN 'human' ELSE 'agent' END AS "source",
      SUM(e."amount")::bigint AS "total",
      COUNT(*)::int AS "count"
    FROM "public"."Expense" e
    WHERE e."groupId" = ${groupId}
      AND e."deletedBy" IS NULL
      AND e."splitType" NOT IN ('SETTLEMENT', 'CURRENCY_CONVERSION')
      AND e."expenseDate" >= (${iso(start)}::timestamptz AT TIME ZONE 'UTC')
      AND e."expenseDate" < (${iso(end)}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1, 2, 3, 4
  `;
  return rows.map(toSpendRow);
};

/** Monthly project spend (see getGroupPeriodSpend). */
export const getGroupMonthlySpend = (
  db: PrismaClient,
  args: { groupId: number; start: Date; end: Date; tzOffset: number },
): Promise<SpendRow[]> => getGroupPeriodSpend(db, { ...args, granularity: 'month' });

/**
 * The signed-in user's own share of spending per local month × currency, across every group and
 * non-group expense they take part in. A participant row stores (paid − share), so the share is
 * `paid − amount`; a lone participant is a personal cost whose whole amount is theirs.
 */
export const getUserMonthlySpend = async (
  db: PrismaClient,
  { userId, start, end, tzOffset }: { userId: number; start: Date; end: Date; tzOffset: number },
): Promise<SpendRow[]> => {
  const rows = await db.$queryRaw<RawSpendRow[]>`
    SELECT
      to_char(date_trunc('month', e."expenseDate" - make_interval(mins => ${tzOffset}::int)), 'YYYY-MM') AS "month",
      e."currency" AS "currency",
      SUM(
        CASE
          WHEN (SELECT COUNT(*) FROM "public"."ExpenseParticipant" p WHERE p."expenseId" = e."id") = 1
            THEN e."amount"
          ELSE (CASE WHEN e."paidBy" = ${userId} THEN e."amount" ELSE 0 END) - ep."amount"
        END
      )::bigint AS "total",
      COUNT(*)::int AS "count"
    FROM "public"."Expense" e
    JOIN "public"."ExpenseParticipant" ep ON ep."expenseId" = e."id" AND ep."userId" = ${userId}
    WHERE e."deletedBy" IS NULL
      AND e."splitType" NOT IN ('SETTLEMENT', 'CURRENCY_CONVERSION')
      AND e."expenseDate" >= (${iso(start)}::timestamptz AT TIME ZONE 'UTC')
      AND e."expenseDate" < (${iso(end)}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1, 2
  `;
  return rows.map(toSpendRow);
};
