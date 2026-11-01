import { clsx } from 'clsx';
import { BellIcon, BellOffIcon } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { toast } from 'sonner';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { DEFAULT_REMIND_DAYS_BEFORE } from '~/server/reminders/dueDate';
import { daysUntil } from '~/server/subscriptions/helpers';
import { api } from '~/utils/api';

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

/** Bell beside a subscription: turns its "renews in N days" reminder on or off for everyone. */
const ReminderToggle: React.FC<{ recurrenceId: number; name: string }> = ({
  recurrenceId,
  name,
}) => {
  const { t } = useTranslationWithUtils(['reminders']);
  const utils = api.useUtils();
  // One shared query for every row on the page.
  const reminders = api.reminders.list.useQuery();
  const setReminder = api.reminders.setReminder.useMutation({
    onSuccess: (updated) => {
      utils.reminders.list.setData(undefined, (current) =>
        (current ?? [])
          .filter(({ id }) => id !== updated.id)
          .concat(updated)
          .sort((a, b) => a.id - b.id),
      );
    },
  });

  const daysBefore =
    reminders.data?.find(({ id }) => id === recurrenceId)?.remindDaysBefore ?? null;
  const isOn = null !== daysBefore;

  const toggle = () => {
    setReminder
      .mutateAsync({ recurrenceId, daysBefore: isOn ? null : DEFAULT_REMIND_DAYS_BEFORE })
      .then((updated) => {
        toast.success(
          t(null === updated.remindDaysBefore ? 'row.turned_off' : 'row.turned_on', { name }),
        );
      })
      .catch((error: unknown) => {
        console.error(error);
        toast.error(t('row.error'));
      });
  };

  const Icon = isOn ? BellIcon : BellOffIcon;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!reminders.data || setReminder.isPending}
      aria-pressed={isOn}
      aria-label={
        isOn
          ? t('row.turn_off', { name })
          : t('row.turn_on', { name, days: DEFAULT_REMIND_DAYS_BEFORE })
      }
      className={clsx(
        'focus-visible:ring-focus flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 disabled:opacity-50',
        isOn ? 'text-accent' : 'text-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden fill={isOn ? 'currentColor' : 'none'} />
    </button>
  );
};

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
    <li className="hover:bg-default/40 flex items-center pe-1.5 transition-colors">
      <Link
        href={expenseHref(item.id, item.groupId)}
        className="focus-visible:ring-focus flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 ps-3.5 pe-1 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
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
      <ReminderToggle recurrenceId={item.recurrenceId} name={item.description} />
    </li>
  );
};
