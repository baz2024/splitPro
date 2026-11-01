import { findService } from '~/lib/serviceCatalog';

/** Share of a cap (whole percent) at which an agent's cap bar turns amber. */
export const CAP_WARN_PERCENT = 80;

/** Most entries an agent key's provider/model allow-list may hold. */
export const MAX_ALLOW_LIST_ENTRIES = 20;
export const MAX_ALLOW_LIST_ENTRY_LENGTH = 100;

export type CapTone = 'none' | 'success' | 'warning' | 'danger';

/**
 * Colour for a cap bar: green under 80%, amber from 80% up to (not including) the cap, red at or
 * over the cap. `percent` is rounded down, so 99.9% is still amber; `hasCap` false means no bar.
 */
export const capTone = ({ percent, hasCap }: { percent: number; hasCap: boolean }): CapTone => {
  if (!hasCap) {
    return 'none';
  }
  if (100 <= percent) {
    return 'danger';
  }
  return CAP_WARN_PERCENT <= percent ? 'warning' : 'success';
};

const normaliseEntry = (value: string) => value.trim().toLowerCase();

/** Trim, lower-case, drop blanks and duplicates; keeps the first MAX_ALLOW_LIST_ENTRIES. */
export const normaliseAllowList = (entries: readonly string[]): string[] =>
  [
    ...new Set(
      entries
        .map(normaliseEntry)
        .filter((entry) => '' !== entry && MAX_ALLOW_LIST_ENTRY_LENGTH >= entry.length),
    ),
  ].slice(0, MAX_ALLOW_LIST_ENTRIES);

/** Splits a comma- or newline-separated text field into allow-list entries. */
export const parseAllowListInput = (value: string): string[] =>
  normaliseAllowList(value.split(/[,\n]/));

const matchesModel = (entry: string, model: string) =>
  entry.endsWith('*') ? model.startsWith(entry.slice(0, -1)) : entry === model;

const matchesProvider = (entry: string, service: string) => {
  if (entry === service) {
    return true;
  }
  const entryService = findService(entry);
  return undefined !== entryService && entryService.id === findService(service)?.id;
};

export interface AllowListCheck {
  allowed: boolean;
  /** Why a report is outside the list, for the agent; null when allowed. */
  reason: string | null;
}

/**
 * Whether an agent may report spend for this provider and model. An empty list allows anything.
 * Each entry is a provider (catalog id or name, e.g. "anthropic") that allows all its models, or
 * a model ("claude-sonnet-4-5", or a prefix ending in "*" such as "claude-*"). Case-insensitive.
 */
export const checkAllowList = (
  allowList: readonly string[] | null | undefined,
  { service, model }: { service: string; model?: string | null },
): AllowListCheck => {
  const entries = normaliseAllowList(allowList ?? []);
  if (0 === entries.length) {
    return { allowed: true, reason: null };
  }
  const normalisedService = normaliseEntry(service);
  const normalisedModel = model ? normaliseEntry(model) : null;
  const allowed = entries.some(
    (entry) =>
      matchesProvider(entry, normalisedService) ||
      (null !== normalisedModel && matchesModel(entry, normalisedModel)),
  );
  if (allowed) {
    return { allowed: true, reason: null };
  }
  const target = normalisedModel ? `${normalisedService} / ${normalisedModel}` : normalisedService;
  return {
    allowed: false,
    reason: `${target} is not in this agent's allowed providers or models (${entries.join(', ')})`,
  };
};

/** "safi_AbC…wxyz", or "safi_AbC…" for keys created before the last four were stored. */
export const maskApiKey = (prefix: string, lastFour: string | null | undefined): string =>
  `${prefix}…${lastFour ?? ''}`;

export interface AgentSpendLike {
  currency: string | null;
  monthToDate: bigint;
  cap: bigint | null;
}

export interface AgentSpendTotals {
  /** Currency the totals are in: the one most agents report in; null when no agent has spend. */
  currency: string | null;
  /** Spend of every agent in `currency` this month. */
  spent: bigint;
  /** Spend of the agents that have a cap, so it can be compared with `capTotal`. */
  cappedSpent: bigint;
  /** Sum of the caps in `currency`; null when no agent has one. */
  capTotal: bigint | null;
  agentCount: number;
  cappedCount: number;
  /** Agents in other currencies, which are left out (no conversion is applied). */
  excludedCount: number;
}

/**
 * Header totals for the Agents tab: agent-reported spend against the sum of agent caps (never a
 * project budget). Only one currency is summed.
 */
export const summarizeAgentSpend = (
  agents: readonly AgentSpendLike[],
  preferredCurrency: string | null = null,
): AgentSpendTotals => {
  const counts = agents.reduce((acc, agent) => {
    if (agent.currency) {
      acc.set(agent.currency, (acc.get(agent.currency) ?? 0) + 1);
    }
    return acc;
  }, new Map<string, number>());
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const currency =
    preferredCurrency && counts.has(preferredCurrency)
      ? preferredCurrency
      : (ranked[0]?.[0] ?? null);

  const inCurrency = agents.filter((agent) => null !== currency && agent.currency === currency);
  const capped = inCurrency.filter((agent) => null !== agent.cap);

  return {
    currency,
    spent: inCurrency.reduce((sum, agent) => sum + agent.monthToDate, 0n),
    cappedSpent: capped.reduce((sum, agent) => sum + agent.monthToDate, 0n),
    capTotal:
      0 === capped.length ? null : capped.reduce((sum, agent) => sum + (agent.cap ?? 0n), 0n),
    agentCount: agents.length,
    cappedCount: capped.length,
    excludedCount: agents.filter((agent) => null !== agent.currency && agent.currency !== currency)
      .length,
  };
};

/** Whole minutes between two instants, never negative. */
export const minutesBetween = (from: Date, to: Date): number =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));

export type RelativeUnit = 'minute' | 'hour' | 'day';

/**
 * How long ago something happened, as one value + unit for Intl.RelativeTimeFormat
 * ("4 min ago", "2 hours ago", "3 days ago"); null when it was under a minute ago.
 */
export const relativeTimeParts = (
  from: Date,
  now: Date,
): { value: number; unit: RelativeUnit } | null => {
  const minutes = minutesBetween(from, now);
  if (1 > minutes) {
    return null;
  }
  if (60 > minutes) {
    return { value: minutes, unit: 'minute' };
  }
  if (24 * 60 > minutes) {
    return { value: Math.floor(minutes / 60), unit: 'hour' };
  }
  return { value: Math.floor(minutes / (24 * 60)), unit: 'day' };
};
