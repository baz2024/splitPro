import { clsx } from 'clsx';
import Link from 'next/link';
import React from 'react';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { daysUntil } from '~/server/subscriptions/helpers';

import { SUBSCRIPTIONS_NAMESPACES, type SubscriptionListItem, expenseHref } from './types';

interface SubscriptionRowProps {
  item: SubscriptionListItem;
  currentUserId: number;
  now: Date;
  /** Show the amount per billing cycle (By cycle view). */
  showCycle?: boolean;
}

const CYCLE_KEYS = {
  monthly: 'row.per_month',
  yearly: 'row.per_year',
  weekly: 'row.per_week',
  other: null,
} as const;

export const SubscriptionRow: React.FC<SubscriptionRowProps> = ({
  item,
  currentUserId,
  now,
  showCycle = false,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(SUBSCRIPTIONS_NAMESPACES);
  const { toUIString } = getCurrencyHelpersCached(item.currency);

  const days = item.nextDueDate ? daysUntil(item.nextDueDate, now) : null;
  const isSoon = null !== days && 1 >= days;

  const due = null === days ? t('row.due_unknown') : t('row.due', { days });
  const paidBy =
    currentUserId === item.paidBy.id
      ? t('row.paid_by_you')
      : t('row.paid_by', { name: item.paidBy.name ?? item.paidBy.email ?? '' });
  // Two facts at most: when it renews, then the payer (personal or due soon) or the split.
  const secondary =
    'personal' === item.split.kind || isSoon ? paidBy : t('row.split', { ways: item.split.ways });

  const amount = toUIString(item.amount);
  const cycleKey = CYCLE_KEYS[item.cadence];
  const amountLabel = showCycle && cycleKey ? t(cycleKey, { amount }) : amount;

  return (
    <li>
      <Link
        href={expenseHref(item.id, item.groupId)}
        className="hover:bg-default/40 focus-visible:ring-focus flex min-h-16 items-center gap-3 px-3.5 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      >
        <ServiceBadge service={item.description} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground truncate text-sm font-medium">{item.description}</span>
          <span className={clsx('line-clamp-2 text-xs', isSoon ? 'text-warning' : 'text-muted')}>
            {due} · {secondary}
          </span>
        </span>
        <span dir="ltr" className="text-foreground shrink-0 text-sm font-semibold">
          {amountLabel}
        </span>
      </Link>
    </li>
  );
};
