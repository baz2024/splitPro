import { clsx } from 'clsx';
import Link from 'next/link';
import React from 'react';

import { billingProviderName } from '~/components/Billing/SyncedBadge';
import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

import { SUBSCRIPTIONS_NAMESPACES, type UsageListItem, expenseHref } from './types';

interface UsageRowProps {
  item: UsageListItem;
  /** Short name of last month, e.g. "Oct". */
  lastMonthLabel: string;
}

export const UsageRow: React.FC<UsageRowProps> = ({ item, lastMonthLabel }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(SUBSCRIPTIONS_NAMESPACES);
  const { toUIString } = getCurrencyHelpersCached(item.currency);

  const change =
    null === item.changePercent
      ? null
      : new Intl.NumberFormat(i18n.language, {
          style: 'percent',
          signDisplay: 'exceptZero',
        }).format(item.changePercent / 100);

  return (
    <li>
      <Link
        href={expenseHref(item.lastExpenseId, item.lastExpenseGroupId)}
        className="hover:bg-default/40 focus-visible:ring-focus flex min-h-16 items-center gap-3 px-3.5 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      >
        <ServiceBadge service={item.name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground truncate text-sm font-medium">{item.name}</span>
          <span className="text-muted line-clamp-2 text-xs">
            {item.syncedFrom
              ? t('usage.synced_from', { provider: billingProviderName(item.syncedFrom) })
              : t('usage.source')}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span dir="ltr" className="text-foreground text-sm font-semibold">
            {toUIString(item.thisMonth)}
          </span>
          <span
            className={clsx(
              'text-[11px]',
              null === item.changePercent || 0 === item.changePercent
                ? 'text-muted'
                : 0 < item.changePercent
                  ? 'text-danger'
                  : 'text-success',
            )}
          >
            {null === change
              ? t('usage.new_this_month')
              : t('usage.vs_last_month', { change, month: lastMonthLabel })}
          </span>
        </span>
      </Link>
    </li>
  );
};
