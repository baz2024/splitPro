import { Bot } from 'lucide-react';
import React from 'react';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { CategoryIcon } from '~/components/ui/categoryIcons';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { findService } from '~/lib/serviceCatalog';
import { cn } from '~/lib/utils';
import { type AgentSpend } from '~/server/agent/caps';
import { type UsageRow } from '~/server/agent/usage';

const TECH_ITEMS = new Set([
  'aiApis',
  'codingAgents',
  'cloudHosting',
  'databases',
  'devTools',
  'domains',
  'monitoring',
  'messagingApis',
  'saas',
]);

const RowBadge: React.FC<{ row: UsageRow }> = ({ row }) => {
  if ('agent' === row.kind) {
    return (
      <span
        aria-hidden="true"
        className="bg-accent/15 text-accent inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
      >
        <Bot className="size-4" />
      </span>
    );
  }
  if (findService(row.badge)) {
    return <ServiceBadge service={row.badge} size="sm" />;
  }
  return (
    <span
      aria-hidden="true"
      className="bg-default text-muted inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
    >
      <CategoryIcon category={row.category} className="size-4" />
    </span>
  );
};

const capBarTone = (agent: AgentSpend) =>
  'over' === agent.state || 'reached' === agent.state
    ? 'bg-danger'
    : 'near' === agent.state
      ? 'bg-warning'
      : 'bg-success';

/** Spend-vs-cap bar for an agent row; only rendered when the agent has a cap. */
const CapBar: React.FC<{ agent: AgentSpend }> = ({ agent }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentcaps']);
  if (null === agent.cap || !agent.currency) {
    return null;
  }
  const { toUIString } = getCurrencyHelpersCached(agent.currency);
  const width = Math.min(Math.max(agent.percent, 0), 100);
  const label = t('spent_by.cap_bar_label', {
    spent: toUIString(agent.monthToDate),
    cap: toUIString(agent.cap),
    percent: agent.percent,
  });
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      title={label}
      className="bg-default h-2 w-16 shrink-0 overflow-hidden rounded-full sm:w-24"
    >
      <div className={cn('h-2 rounded-full', capBarTone(agent))} style={{ width: `${width}%` }} />
    </div>
  );
};

interface UsageSpentByProps {
  rows: UsageRow[];
  currency: string;
  /** Per-key spend + cap; rows reported through a key show a cap bar when it has a cap. */
  agents?: AgentSpend[];
}

/** "Spent by" list: one row per reporting agent or service, with this month's amount. */
export const UsageSpentBy: React.FC<UsageSpentByProps> = ({ rows, currency, agents = [] }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils([
    'agentsusage',
    'categories',
    'agentcaps',
  ]);
  const agentById = new Map(agents.map((agent) => [agent.apiKeyId, agent] as const));
  const agentFor = (row: UsageRow) => (row.apiKeyId ? agentById.get(row.apiKeyId) : undefined);
  const hasCaps = rows.some((row) => null !== (agentFor(row)?.cap ?? null));
  const { toUIString } = getCurrencyHelpersCached(currency);

  const categoryLabel = (category: string) =>
    TECH_ITEMS.has(category)
      ? t(`categories_list.tech.items.${category}`, { ns: 'categories' })
      : t('categories_list.tech.name', { ns: 'categories' });

  const rowName = (row: UsageRow) =>
    row.key.startsWith('category:') ? categoryLabel(row.category) : row.name;

  const rowSub = (row: UsageRow) => {
    const model = agentFor(row)?.model;
    if (model) {
      return t('spent_by.agent_model', { ns: 'agentcaps', model });
    }
    return 'agent' === row.kind
      ? t('spent_by.agent_sub', { services: row.services.join(', ') })
      : categoryLabel(row.category);
  };

  return (
    <section aria-labelledby="usage-spent-by" className="flex flex-col">
      <div className="text-muted flex justify-between px-1 pt-1 pb-2 text-xs font-semibold tracking-wider uppercase">
        <h2 id="usage-spent-by">{t('spent_by.title')}</h2>
        <span aria-hidden="true">
          {hasCaps
            ? `${t('spent_by.amount_header')} · ${t('spent_by.cap_header', { ns: 'agentcaps' })}`
            : t('spent_by.amount_header')}
        </span>
      </div>
      {0 === rows.length ? (
        <p className="text-muted px-1 text-sm">{t('spent_by.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {rows.map((row) => {
            const agent = agentFor(row);
            return (
              <li key={row.key} className="flex min-h-11 items-center gap-3">
                <RowBadge row={row} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{rowName(row)}</span>
                  <span className="text-muted truncate text-[11px]">{rowSub(row)}</span>
                </div>
                <span dir="ltr" className="shrink-0 text-sm font-semibold tabular-nums">
                  {toUIString(row.amount)}
                </span>
                {agent && <CapBar agent={agent} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
