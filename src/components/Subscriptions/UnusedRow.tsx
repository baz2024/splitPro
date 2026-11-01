import Link from 'next/link';
import React from 'react';
import { toast } from 'sonner';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { api } from '~/utils/api';

import { type SubscriptionListItem, expenseHref } from './types';

export const UNUSED_NAMESPACES = ['unused', 'common'];

interface UnusedRowProps {
  item: SubscriptionListItem;
}

const SIGNAL_KEYS = {
  confirmed: 'row.last_confirmed',
  seen_in_repo: 'row.last_seen_in_repo',
  usage_expense: 'row.last_usage_expense',
} as const;

/** One unused subscription with "Still using" and "Open expense" actions. */
export const UnusedRow: React.FC<UnusedRowProps> = ({ item }) => {
  const { t, i18n, getCurrencyHelpersCached } = useTranslationWithUtils(UNUSED_NAMESPACES);
  const utils = api.useUtils();
  const markStillUsing = api.subscriptions.markStillUsing.useMutation();

  const lastUsed =
    item.lastUsedAt && item.lastUsedSignal
      ? t(SIGNAL_KEYS[item.lastUsedSignal], {
          date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
            item.lastUsedAt,
          ),
        })
      : t('row.no_signal');

  const handleStillUsing = async () => {
    try {
      await markStillUsing.mutateAsync({ recurrenceId: item.recurrenceId });
      toast.success(t('row.still_using_done', { name: item.description }));
      await utils.subscriptions.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('row.still_using_error'));
    }
  };

  return (
    <li className="flex flex-col gap-3 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <ServiceBadge service={item.description} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground truncate text-sm font-medium">{item.description}</span>
          <span className="text-muted line-clamp-2 text-xs">{lastUsed}</span>
        </span>
        <span dir="ltr" className="text-foreground shrink-0 text-sm font-semibold">
          {t('row.per_month', {
            amount: getCurrencyHelpersCached(item.currency).toUIString(item.monthlyAmount),
          })}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleStillUsing}
          disabled={markStillUsing.isPending}
          className="bg-accent text-accent-foreground focus-visible:ring-focus focus-visible:ring-offset-background min-h-11 flex-1 rounded-full px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          {t('row.still_using')}
        </button>
        <Link
          href={expenseHref(item.id, item.groupId)}
          className="border-border text-foreground focus-visible:ring-focus inline-flex min-h-11 flex-1 items-center justify-center rounded-full border px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
        >
          {t('row.open_expense')}
        </Link>
      </div>
    </li>
  );
};
