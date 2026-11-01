import { type PrismaClient } from '@prisma/client';

import { nextMonthUtc, startOfMonthUtc } from './usage';

/** Share of the cap at which the Agents page warns that an agent is close to its cap. */
export const NEAR_CAP_PERCENT = 80;

export type CapState = 'none' | 'ok' | 'near' | 'reached' | 'over';

export interface CapStatus {
  cap: bigint | null;
  /** Cap minus monthToDate, floored at 0; null when there is no cap. */
  capRemaining: bigint | null;
  /** Spend is strictly above the cap. */
  overCap: boolean;
  /** Spend is at or above the cap: the agent must stop spending. */
  shouldPause: boolean;
  /** Whole percent of the cap used (rounded down, not clamped); 0 when there is no cap. */
  percent: number;
  /** Month-to-date spend extrapolated to the whole month reaches the cap. */
  projectedToHitCap: boolean;
  state: CapState;
}

const daysInMonthUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

/**
 * Projected spend for the whole month at the current daily pace, in minor units.
 * Elapsed time is measured in milliseconds since the start of the UTC month.
 */
export const projectMonthSpend = (monthToDate: bigint, now: Date): bigint => {
  const start = startOfMonthUtc(now).getTime();
  const elapsedMs = BigInt(Math.max(now.getTime() - start, 1));
  const monthMs = BigInt(daysInMonthUtc(now) * 24 * 60 * 60 * 1000);
  return (monthToDate * monthMs) / elapsedMs;
};

/** Cap maths for one agent key. All amounts are BigInt minor units in the cap currency. */
export const computeCapStatus = ({
  monthToDate,
  cap,
  now = new Date(),
}: {
  monthToDate: bigint;
  cap: bigint | null;
  now?: Date;
}): CapStatus => {
  if (null === cap || 0n >= cap) {
    return {
      cap: null,
      capRemaining: null,
      overCap: false,
      shouldPause: false,
      percent: 0,
      projectedToHitCap: false,
      state: 'none',
    };
  }

  const percent = Number((monthToDate * 100n) / cap);
  const overCap = monthToDate > cap;
  const shouldPause = monthToDate >= cap;
  const state: CapState = overCap
    ? 'over'
    : shouldPause
      ? 'reached'
      : NEAR_CAP_PERCENT <= percent
        ? 'near'
        : 'ok';

  return {
    cap,
    capRemaining: cap > monthToDate ? cap - monthToDate : 0n,
    overCap,
    shouldPause,
    percent,
    projectedToHitCap: shouldPause || projectMonthSpend(monthToDate, now) >= cap,
    state,
  };
};

/**
 * This UTC month's spend reported by each key, per currency (sum of the full expense amount:
 * the key owner pays every reported expense).
 */
export const loadKeyMonthSpend = async (
  db: PrismaClient,
  apiKeyIds: string[],
  now = new Date(),
): Promise<Map<string, Map<string, bigint>>> => {
  if (0 === apiKeyIds.length) {
    return new Map();
  }

  const grouped = await db.expense.groupBy({
    by: ['reportedByApiKeyId', 'currency'],
    where: {
      reportedByApiKeyId: { in: apiKeyIds },
      deletedAt: null,
      expenseDate: { gte: startOfMonthUtc(now), lt: nextMonthUtc(now) },
    },
    _sum: { amount: true },
  });

  return grouped.reduce((acc, row) => {
    if (!row.reportedByApiKeyId) {
      return acc;
    }
    const perCurrency = acc.get(row.reportedByApiKeyId) ?? new Map<string, bigint>();
    // oxlint-disable-next-line no-underscore-dangle -- Prisma's aggregate field name
    const amount = row._sum.amount ?? 0n;
    perCurrency.set(row.currency, (perCurrency.get(row.currency) ?? 0n) + amount);
    acc.set(row.reportedByApiKeyId, perCurrency);
    return acc;
  }, new Map<string, Map<string, bigint>>());
};

/**
 * Pick the currency a key's spend is measured in: the cap currency when a cap is set, else the
 * fallback (the report's currency), else the currency with the most spend.
 */
export const pickKeyCurrency = (
  perCurrency: ReadonlyMap<string, bigint> | undefined,
  capCurrency: string | null,
  fallback: string | null = null,
): string | null => {
  if (capCurrency) {
    return capCurrency;
  }
  if (fallback) {
    return fallback;
  }
  const ranked = [...(perCurrency ?? new Map<string, bigint>()).entries()].sort((a, b) =>
    a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1,
  );
  return ranked[0]?.[0] ?? null;
};

export interface AgentKeyRow {
  id: string;
  name: string;
  agentLabel: string | null;
  model: string | null;
  monthlyCapAmount: bigint | null;
  capCurrency: string | null;
  group: { id: number; name: string } | null;
}

export interface AgentSpend extends CapStatus {
  apiKeyId: string;
  label: string;
  model: string | null;
  project: { id: number; name: string } | null;
  currency: string | null;
  monthToDate: bigint;
  /** Currencies this key reported in that are not counted (no conversion is applied). */
  otherCurrencies: string[];
}

/** Per-key month-to-date spend with cap status, for the Agents page and the usage endpoint. */
export const buildAgentSpend = (
  key: AgentKeyRow,
  perCurrency: ReadonlyMap<string, bigint> | undefined,
  now = new Date(),
  fallbackCurrency: string | null = null,
): AgentSpend => {
  const cap = key.capCurrency ? key.monthlyCapAmount : null;
  const currency = pickKeyCurrency(perCurrency, cap ? key.capCurrency : null, fallbackCurrency);
  const monthToDate = currency ? (perCurrency?.get(currency) ?? 0n) : 0n;

  return {
    apiKeyId: key.id,
    label: key.agentLabel?.trim() || key.name,
    model: key.model,
    project: key.group,
    currency,
    monthToDate,
    otherCurrencies: [...(perCurrency?.keys() ?? [])].filter((code) => code !== currency).sort(),
    ...computeCapStatus({ monthToDate, cap, now }),
  };
};

export const AGENT_KEY_SELECT = {
  id: true,
  name: true,
  agentLabel: true,
  model: true,
  monthlyCapAmount: true,
  capCurrency: true,
  group: { select: { id: true, name: true } },
} as const;

/** Spend + cap for every active key the user owns, most spent first. */
export const loadAgentSpends = async (
  db: PrismaClient,
  userId: number,
  now = new Date(),
): Promise<AgentSpend[]> => {
  const keys = await db.apiKey.findMany({
    where: { userId, revokedAt: null },
    select: AGENT_KEY_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  const spend = await loadKeyMonthSpend(
    db,
    keys.map((key) => key.id),
    now,
  );
  return keys
    .map((key) => buildAgentSpend(key, spend.get(key.id), now))
    .sort((a, b) =>
      a.monthToDate === b.monthToDate
        ? a.label.localeCompare(b.label)
        : a.monthToDate > b.monthToDate
          ? -1
          : 1,
    );
};

const ALERT_STATES = new Set<AgentSpend['state']>(['over', 'reached', 'near']);

/** Agents at or near their cap, worst first (over, then reached, then highest percent). */
export const agentsNeedingAttention = (agents: AgentSpend[]): AgentSpend[] => {
  const rank = { over: 0, reached: 1, near: 2, ok: 3, none: 4 } as const;
  return agents
    .filter((agent) => ALERT_STATES.has(agent.state))
    .sort((a, b) => rank[a.state] - rank[b.state] || b.percent - a.percent);
};
