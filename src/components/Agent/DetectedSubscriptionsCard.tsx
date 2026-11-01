import { Button, Card, Chip, Disclosure } from '@heroui/react';
import { Bot, ExternalLink, FolderGit2, Plus, X } from 'lucide-react';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { CategoryIcon } from '~/components/ui/categoryIcons';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { api } from '~/utils/api';

import {
  type DetectedSubscriptionItem,
  PREFILL_GUARD_MS,
  holdExpensePrefill,
  toExpensePrefill,
  toTechCategory,
} from './expensePrefill';

const DetectedRow: React.FC<{
  item: DetectedSubscriptionItem;
  busy: boolean;
  onAdd: (item: DetectedSubscriptionItem) => void;
  onDismiss: (item: DetectedSubscriptionItem) => void;
}> = ({ item, busy, onAdd, onDismiss }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['common', 'categories']);
  const category = toTechCategory(item.category);
  const { cost } = toExpensePrefill(item);
  const hasDetails =
    0 < item.evidence.length || Boolean(item.vendor ?? item.agent ?? item.pricingUrl);

  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex items-start gap-3">
        <div className="bg-accent/10 text-accent flex size-10 shrink-0 items-center justify-center rounded-xl">
          <CategoryIcon category={category} className="size-5" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{item.service}</span>
            {cost && (
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {t('agents.detected.per_month', {
                  amount: getCurrencyHelpersCached(cost.currency).toUIString(cost.amount),
                })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="soft" color="accent">
              {t(`categories_list.tech.items.${category}`, { ns: 'categories' })}
            </Chip>
            {item.detectedIn && (
              <span className="text-muted flex min-w-0 items-center gap-1 text-xs">
                <FolderGit2 className="size-3.5 shrink-0" aria-hidden />
                <span dir="ltr" className="truncate">
                  {item.detectedIn}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {hasDetails && (
        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="text-muted flex w-full items-center justify-between gap-2 text-xs font-medium">
              {t('agents.detected.details', { count: item.evidence.length })}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="flex flex-col gap-2 pt-2 text-xs">
              {0 < item.evidence.length && (
                <ul className="bg-surface border-border flex flex-col gap-1 rounded-lg border p-2">
                  {item.evidence.map((line) => (
                    <li key={line} dir="ltr" className="text-start font-mono break-all">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
              {item.vendor && (
                <p className="text-muted">{t('agents.detected.vendor', { vendor: item.vendor })}</p>
              )}
              {item.agent && (
                <p className="text-muted flex items-center gap-1">
                  <Bot className="size-3.5" aria-hidden />
                  {t('agents.detected.reported_by', { agent: item.agent })}
                </p>
              )}
              {item.pricingUrl && (
                <a
                  href={item.pricingUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent flex items-center gap-1 self-start font-medium"
                >
                  {t('agents.detected.pricing')}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          isDisabled={busy}
          aria-label={`${t('agents.detected.dismiss')}: ${item.service}`}
          onPress={() => onDismiss(item)}
        >
          <X className="size-4" aria-hidden />
          {t('agents.detected.dismiss')}
        </Button>
        <Button size="sm" isDisabled={busy} onPress={() => onAdd(item)}>
          <Plus className="size-4" aria-hidden />
          {t('agents.detected.add')}
        </Button>
      </div>
    </li>
  );
};

/**
 * Inbox of subscriptions reported by coding agents. Renders nothing unless there are
 * pending items, so it can sit on any signed-in page.
 */
export const DetectedSubscriptionsCard: React.FC<{ enabled?: boolean; className?: string }> = ({
  enabled = true,
  className,
}) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['common', 'categories']);
  const router = useRouter();
  const utils = api.useUtils();
  const pendingQuery = api.agent.listDetectedSubscriptions.useQuery(
    { status: 'PENDING' },
    { enabled },
  );
  const dismissMutation = api.agent.dismissDetectedSubscription.useMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = pendingQuery.data ?? [];
  if (!enabled || 0 === items.length) {
    return null;
  }

  const refresh = () => utils.agent.listDetectedSubscriptions.invalidate().catch(console.error);

  const onDismiss = async (item: DetectedSubscriptionItem) => {
    setBusyId(item.id);
    try {
      await dismissMutation.mutateAsync({ id: item.id });
      toast.success(t('agents.detected.dismissed', { service: item.service }));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agents.detected.error'));
    } finally {
      setBusyId(null);
    }
  };

  const onAdd = async (item: DetectedSubscriptionItem) => {
    setBusyId(item.id);
    // Stays PENDING here: AddExpenseJourney marks it ADDED (with the new expense id) on save.
    const release = holdExpensePrefill(toExpensePrefill(item), (amount, currency) =>
      getCurrencyHelpersCached(currency).toUIString(amount, false, true),
    );
    try {
      await router.push({ pathname: '/add', query: { mode: 'manual' } });
    } catch (error) {
      console.error(error);
    } finally {
      setTimeout(release, PREFILL_GUARD_MS);
      setBusyId(null);
    }
  };

  return (
    <Card variant="secondary" className={className}>
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <Bot className="text-accent size-4" aria-hidden />
          {t('agents.detected.title')}
          <Chip size="sm" color="accent" variant="primary" className="ms-auto">
            {items.length}
          </Chip>
        </Card.Title>
        <Card.Description>{t('agents.detected.description')}</Card.Description>
      </Card.Header>
      <Card.Content className="p-0">
        <ul className="divide-border divide-y">
          {items.map((item) => (
            <DetectedRow
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onAdd={(row) => {
                onAdd(row).catch(console.error);
              }}
              onDismiss={(row) => {
                onDismiss(row).catch(console.error);
              }}
            />
          ))}
        </ul>
      </Card.Content>
    </Card>
  );
};
