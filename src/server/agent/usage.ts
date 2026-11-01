import { type PrismaClient } from '@prisma/client';

import { findService } from '~/lib/serviceCatalog';

/** Tech categories that count as AI / developer spend on the Agents & API usage page. */
export const AI_SPEND_CATEGORIES = [
  'aiApis',
  'codingAgents',
  'cloudHosting',
  'databases',
  'devTools',
  'messagingApis',
  'monitoring',
  'saas',
  'domains',
  'tech',
] as const;

export interface UsageExpense {
  id: string;
  name: string;
  category: string;
  currency: string;
  amount: bigint;
  paidBy: number;
  /** The user's ExpenseParticipant amount (net), or null when the user has no participant row. */
  participantAmount: bigint | null;
}

export interface UsageRow {
  /** `agent:<name>` or `service:<id>` / `category:<key>`. */
  key: string;
  kind: 'agent' | 'service';
  name: string;
  /** Catalog id or name used for the badge. */
  badge: string;
  /** Category of the first expense in the row, for the sub-label. */
  category: string;
  /** Services an agent reported, for the agent sub-label. */
  services: string[];
  amount: bigint;
}

export interface UsageSummary {
  currency: string | null;
  total: bigint;
  rows: UsageRow[];
  /** Currencies with AI spend that are not included in `total` (no conversion is applied). */
  otherCurrencies: string[];
}

/**
 * The user's own share of an expense in minor units.
 * Participant amounts are net (payer: amount - share, others: -share), and a payer whose net
 * is zero has no participant row, so share = (paid ? amount : 0) - participantAmount.
 */
export const userShareOf = (expense: UsageExpense, userId: number): bigint =>
  (userId === expense.paidBy ? expense.amount : 0n) - (expense.participantAmount ?? 0n);

const rowIdentity = (
  expense: UsageExpense,
  agentByExpenseId: ReadonlyMap<string, string>,
): Pick<UsageRow, 'key' | 'kind' | 'name' | 'badge'> => {
  const agent = agentByExpenseId.get(expense.id);
  if (agent) {
    return { key: `agent:${agent}`, kind: 'agent', name: agent, badge: agent };
  }
  const service = findService(expense.name);
  if (service) {
    return { key: `service:${service.id}`, kind: 'service', name: service.name, badge: service.id };
  }
  return {
    key: `category:${expense.category}`,
    kind: 'service',
    name: expense.category,
    badge: expense.category,
  };
};

const pickCurrency = (totals: ReadonlyMap<string, bigint>, preferred: string | null) => {
  if (preferred) {
    return preferred;
  }
  const ranked = [...totals.entries()].sort((a, b) => (a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1));
  return ranked[0]?.[0] ?? preferred;
};

/**
 * Aggregate the user's AI / developer spend.
 * Amounts are only summed within one currency (the preferred one, usually the project budget
 * currency, else the one with the most spend); other currencies are listed so the UI can say they are excluded.
 */
export const aggregateUsage = ({
  expenses,
  userId,
  agentByExpenseId = new Map(),
  preferredCurrency = null,
}: {
  expenses: UsageExpense[];
  userId: number;
  agentByExpenseId?: ReadonlyMap<string, string>;
  preferredCurrency?: string | null;
}): UsageSummary => {
  const shares = expenses
    .map((expense) => ({ expense, share: userShareOf(expense, userId) }))
    .filter(({ share }) => 0n < share);

  const totals = shares.reduce((acc, { expense, share }) => {
    acc.set(expense.currency, (acc.get(expense.currency) ?? 0n) + share);
    return acc;
  }, new Map<string, bigint>());

  const currency = pickCurrency(totals, preferredCurrency);

  const rows = shares
    .filter(({ expense }) => expense.currency === currency)
    .reduce((acc, { expense, share }) => {
      const identity = rowIdentity(expense, agentByExpenseId);
      const existing = acc.get(identity.key);
      const serviceName = findService(expense.name)?.name ?? expense.name;
      if (existing) {
        existing.amount += share;
        if (!existing.services.includes(serviceName)) {
          existing.services.push(serviceName);
        }
        return acc;
      }
      acc.set(identity.key, {
        ...identity,
        category: expense.category,
        services: [serviceName],
        amount: share,
      });
      return acc;
    }, new Map<string, UsageRow>());

  return {
    currency,
    total: currency ? (totals.get(currency) ?? 0n) : 0n,
    rows: [...rows.values()].sort((a, b) =>
      a.amount === b.amount ? a.name.localeCompare(b.name) : a.amount > b.amount ? -1 : 1,
    ),
    otherCurrencies: [...totals.keys()].filter((code) => code !== currency).sort(),
  };
};

export const startOfMonthUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export const nextMonthUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

export interface ProjectCap {
  groupId: number;
  name: string;
  amount: bigint | null;
  currency: string | null;
}

interface GroupRow {
  id: number;
  name: string;
  defaultCurrency: string | null;
}

/**
 * Turn a group row into its cap. The budget fields are read from the full row at runtime and
 * treated as absent when missing.
 */
const toProjectCap = (group: GroupRow): ProjectCap => {
  const row: Record<string, unknown> = { ...group };
  const rawAmount = row.budgetAmount;
  const amount =
    'bigint' === typeof rawAmount
      ? rawAmount
      : 'number' === typeof rawAmount
        ? BigInt(Math.round(rawAmount))
        : null;
  const rawCurrency = row.budgetCurrency;
  return {
    groupId: group.id,
    name: group.name,
    amount: null !== amount && 0n < amount ? amount : null,
    currency: 'string' === typeof rawCurrency ? rawCurrency : group.defaultCurrency,
  };
};

/** Read one project's budget (only a project the user belongs to). */
export const readProjectCap = async (
  db: PrismaClient,
  userId: number,
  groupId: number,
): Promise<ProjectCap | null> => {
  const group = await db.group.findFirst({
    where: { id: groupId, groupUsers: { some: { userId } } },
  });
  return group ? toProjectCap(group) : null;
};

/**
 * The cap shown when no project is picked: the user's most recently updated, non-archived
 * project that has a budget set.
 */
export const readDefaultProjectCap = async (
  db: PrismaClient,
  userId: number,
): Promise<ProjectCap | null> => {
  const group = await db.group.findFirst({
    where: {
      groupUsers: { some: { userId } },
      archivedAt: null,
      budgetAmount: { gt: 0n },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return group ? toProjectCap(group) : null;
};

/**
 * AI spend this month against a cap. With `groupId`, spend is limited to that project. Without
 * it, spend covers every expense and the cap comes from the default budgeted project.
 */
export const loadUsage = async (
  db: PrismaClient,
  userId: number,
  { groupId, now = new Date() }: { groupId?: number; now?: Date },
) => {
  const scopedProject = groupId ? await readProjectCap(db, userId, groupId) : null;
  const project = groupId ? scopedProject : await readDefaultProjectCap(db, userId);

  const expenses = await db.expense.findMany({
    where: {
      deletedAt: null,
      category: { in: [...AI_SPEND_CATEGORIES] },
      splitType: { notIn: ['SETTLEMENT', 'CURRENCY_CONVERSION'] },
      expenseDate: { gte: startOfMonthUtc(now), lt: nextMonthUtc(now) },
      ...(scopedProject ? { groupId: scopedProject.groupId } : {}),
      OR: [{ paidBy: userId }, { expenseParticipants: { some: { userId } } }],
    },
    select: {
      id: true,
      name: true,
      category: true,
      currency: true,
      amount: true,
      paidBy: true,
      expenseParticipants: { where: { userId }, select: { amount: true } },
    },
  });

  const expenseIds = expenses.map((expense) => expense.id);
  const detections =
    0 === expenseIds.length
      ? []
      : await db.detectedSubscription.findMany({
          where: {
            userId,
            status: 'ADDED',
            expenseId: { in: expenseIds },
            agent: { not: null },
          },
          select: { expenseId: true, agent: true },
        });

  const agentByExpenseId = new Map(
    detections.flatMap(({ expenseId, agent }) =>
      expenseId && agent?.trim() ? [[expenseId, agent.trim()] as const] : [],
    ),
  );

  const summary = aggregateUsage({
    userId,
    agentByExpenseId,
    preferredCurrency: project?.currency ?? null,
    expenses: expenses.map((expense) => ({
      id: expense.id,
      name: expense.name,
      category: expense.category,
      currency: expense.currency,
      amount: expense.amount,
      paidBy: expense.paidBy,
      participantAmount: expense.expenseParticipants[0]?.amount ?? null,
    })),
  });

  // The pickCurrency helper always uses the project currency when one is known, so the cap and total match.
  const cap = project?.amount ?? null;

  return {
    ...summary,
    project: project ? { id: project.groupId, name: project.name } : null,
    cap,
    sources: {
      kafoAi: null !== cap ? ('budget_source' as const) : ('not_connected' as const),
      vercel: 'not_connected' as const,
      supabase: 'not_connected' as const,
    },
  };
};

export type AgentUsage = Awaited<ReturnType<typeof loadUsage>>;
