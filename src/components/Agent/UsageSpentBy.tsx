import { Bot } from 'lucide-react';
import React from 'react';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { CategoryIcon } from '~/components/ui/categoryIcons';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { findService } from '~/lib/serviceCatalog';
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

interface UsageSpentByProps {
  rows: UsageRow[];
  currency: string;
}

/** "Spent by" list: one row per reporting agent or service, with this month's amount. */
export const UsageSpentBy: React.FC<UsageSpentByProps> = ({ rows, currency }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentsusage', 'categories']);
  const { toUIString } = getCurrencyHelpersCached(currency);

  const categoryLabel = (category: string) =>
    TECH_ITEMS.has(category)
      ? t(`categories_list.tech.items.${category}`, { ns: 'categories' })
      : t('categories_list.tech.name', { ns: 'categories' });

  const rowName = (row: UsageRow) =>
    row.key.startsWith('category:') ? categoryLabel(row.category) : row.name;

  const rowSub = (row: UsageRow) =>
    'agent' === row.kind
      ? t('spent_by.agent_sub', { services: row.services.join(', ') })
      : categoryLabel(row.category);

  return (
    <section aria-labelledby="usage-spent-by" className="flex flex-col">
      <div className="text-muted flex justify-between px-1 pt-1 pb-2 text-xs font-semibold tracking-wider uppercase">
        <h2 id="usage-spent-by">{t('spent_by.title')}</h2>
        <span aria-hidden="true">{t('spent_by.amount_header')}</span>
      </div>
      {0 === rows.length ? (
        <p className="text-muted px-1 text-sm">{t('spent_by.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {rows.map((row) => (
            <li key={row.key} className="flex min-h-11 items-center gap-3">
              <RowBadge row={row} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{rowName(row)}</span>
                <span className="text-muted truncate text-[11px]">{rowSub(row)}</span>
              </div>
              <span dir="ltr" className="shrink-0 text-sm font-semibold tabular-nums">
                {toUIString(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
