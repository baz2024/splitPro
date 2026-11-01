import { type PrismaClient } from '@prisma/client';

import { type SpendRow } from './shape';

interface RawSpendRow {
  month: string;
  currency: string;
  category?: string;
  total: bigint | number | string | null;
  count: number | bigint;
}

const toSpendRow = (row: RawSpendRow): SpendRow => ({
  month: row.month,
  currency: row.currency,
  ...(undefined === row.category ? {} : { category: row.category }),
  total: BigInt(row.total ?? 0),
  count: Number(row.count),
});

/**
 * Timestamps are stored as UTC wall-clock `timestamp` values. Passing ISO strings and converting
 * them explicitly keeps the comparison independent of how the driver types a JS `Date`.
 */
const iso = (date: Date) => date.toISOString();

/**
 * Group spend per local month × currency × category, aggregated in Postgres. Settlements,
 * currency conversions and deleted expenses are excluded, as in the project summary. Amounts are
 * the full expense totals (what the project spent), not one member's share.
 */
export const getGroupMonthlySpend = async (
  db: PrismaClient,
  { groupId, start, end, tzOffset }: { groupId: number; start: Date; end: Date; tzOffset: number },
): Promise<SpendRow[]> => {
  const rows = await db.$queryRaw<RawSpendRow[]>`
    SELECT
      to_char(date_trunc('month', e."expenseDate" - make_interval(mins => ${tzOffset}::int)), 'YYYY-MM') AS "month",
      e."currency" AS "currency",
      e."category" AS "category",
      SUM(e."amount")::bigint AS "total",
      COUNT(*)::int AS "count"
    FROM "public"."Expense" e
    WHERE e."groupId" = ${groupId}
      AND e."deletedBy" IS NULL
      AND e."splitType" NOT IN ('SETTLEMENT', 'CURRENCY_CONVERSION')
      AND e."expenseDate" >= (${iso(start)}::timestamptz AT TIME ZONE 'UTC')
      AND e."expenseDate" < (${iso(end)}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1, 2, 3
  `;
  return rows.map(toSpendRow);
};

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
