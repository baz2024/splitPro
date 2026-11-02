import { CircleHelp } from 'lucide-react';
import React from 'react';

import { Money } from '~/components/Safi/Money';
import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type ProviderRow } from '~/server/agent/usage';

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

/**
 * Providers tab: this month's AI & dev spend per provider (Anthropic, OpenAI, Vercel…), whoever
 * reported it. Spend that matches no known provider is one honest "Not matched" row at the end.
 */
export const UsageProviders: React.FC<{ rows: ProviderRow[]; currency: string }> = ({
  rows,
  currency,
}) => {
  const { t } = useTranslationWithUtils(['agentsusage', 'categories']);

  const categoryLabel = (category: string) =>
    TECH_ITEMS.has(category)
      ? t(`categories_list.tech.items.${category}`, { ns: 'categories' })
      : t('categories_list.tech.name', { ns: 'categories' });

  return (
    <section aria-labelledby="usage-providers" className="flex flex-col">
      <div className="text-muted flex justify-between px-1 pt-1 pb-2 text-xs font-semibold tracking-wider uppercase">
        <h2 id="usage-providers">{t('providers.title')}</h2>
        <span aria-hidden="true">{t('audit_g.share_header')}</span>
      </div>
      {0 < rows.length && <p className="text-muted px-1 pb-2 text-xs">{t('audit_g.share_note')}</p>}
      {0 === rows.length ? (
        <p className="text-muted px-1 text-sm">{t('providers.empty')}</p>
      ) : (
        <ul className="bg-surface border-border divide-border flex flex-col divide-y rounded-[20px] border">
          {rows.map((row) => (
            <li key={row.key} className="flex min-h-14 items-center gap-3 px-4 py-2">
              {row.serviceId ? (
                <ServiceBadge service={row.serviceId} size="sm" />
              ) : (
                <span
                  aria-hidden="true"
                  className="bg-default text-muted inline-flex size-8 shrink-0 items-center justify-center rounded-[10px]"
                >
                  <CircleHelp className="size-4" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">
                  {row.serviceId ? row.name : t('providers.other')}
                </span>
                {!row.serviceId && (
                  <span className="text-muted truncate text-[11px]">
                    {t('providers.other_sub', {
                      categories: row.categories.map(categoryLabel).join(', '),
                    })}
                  </span>
                )}
              </div>
              <Money amount={row.amount} currency={currency} className="shrink-0 text-sm" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
